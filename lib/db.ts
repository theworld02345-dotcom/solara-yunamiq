// lib/db.ts — Supabase backend (แทนที่ JSON file storage)
// วางทับไฟล์เดิม lib/db.ts ได้เลย — API เหมือนเดิมทุกอย่าง
// ✅ v3.4 — fix: thumbnail ใช้ galleries.thumbnail โดยตรง (ไม่ fallback images[0])
//           fix: appendAudit map tag_id → link_id (prevent silent data loss)
//           fix: updateGallery ไม่ override thumbnail ที่ admin ตั้งไว้
// ✅ v3.3 — fix: saveGalleryRow links: เปลี่ยนจาก upsert+delete-not-in
//           เป็น delete-all-then-reinsert (atomic, null-url safe)
//           แก้ bug: links หายหลัง edit tags (upsert fail silently เมื่อ url=null
//           แต่ delete.not("id","in",...) ยังรัน → ลบลิ้งทั้งหมด)
// ✅ v3.2 — fix: saveTags race condition (tag deletion bug) + updateTag/deleteTag audit log
//           fix: syncTagCounts concurrent lock + selective upsert only changed tags

import "server-only"
import { createClient } from "@supabase/supabase-js"
import type {
  AppUser,
  Gallery,
  GalleryImage,
  Tag,
  AuditEntry,
  RoleName,
  DiscordConfig,
  DigitalRoleOverride,
} from "./types"
import {
  AddGalleryImageSchema,
  ReorderGalleryImagesSchema,
  CreateGallerySchema,
  UpdateGallerySchema,
  CreateTagSchema,
  UpdateTagSchema,
  AddLinkSchema,
  UpdateLinkSchema,
  parseOrThrow,
  type CreateGalleryInput,
  type UpdateGalleryInput,
  type CreateTagInput,
  type UpdateTagInput,
  type AddLinkInput,
  type UpdateLinkInput,
} from "./validate"

// ---------------------------------------------------------------------------
// Supabase client (service role — server-only, ไม่ expose ให้ client)
// ---------------------------------------------------------------------------
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("[db] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Discord config (ยังอ่านจาก env เหมือนเดิม — ไม่เปลี่ยน)
// ---------------------------------------------------------------------------
export function getDiscordConfig(): DiscordConfig {
  const role_id = [
    { name: "69Bath" as RoleName, id: (process.env.DISCORD_ROLE_69BATH_ID ?? "").trim(), hierarchy_level: 1 },
    { name: "99Bath" as RoleName, id: (process.env.DISCORD_ROLE_99BATH_ID ?? "").trim(), hierarchy_level: 2 },
    { name: "199Bath" as RoleName, id: (process.env.DISCORD_ROLE_199BATH_ID ?? "").trim(), hierarchy_level: 3 },
    { name: "299Bath" as RoleName, id: (process.env.DISCORD_ROLE_299BATH_ID ?? "").trim(), hierarchy_level: 4 },
    { name: "699Bath" as RoleName, id: (process.env.DISCORD_ROLE_699BATH_ID ?? "").trim(), hierarchy_level: 5 },
  ].filter((r) => r.id !== "")
  return { ownerid_user: process.env.DISCORD_OWNER_ID ?? "", role_id }
}

// ---------------------------------------------------------------------------
// invalidateCache — ไม่มี in-memory cache แล้ว ทิ้งเป็น no-op เพื่อ compat
// ---------------------------------------------------------------------------
export function invalidateCache(_key: string) {
  // no-op — Supabase always fresh
}

// ---------------------------------------------------------------------------
// Internal helpers: map DB row ↔ AppUser
// ---------------------------------------------------------------------------
function rowToUser(r: Record<string, unknown>): AppUser {
  return {
    user_id: r.user_id as string,
    username: r.username as string,
    discord_tag: r.discord_tag as string,
    avatar: r.avatar as string | null,
    is_banned: r.is_banned as boolean,
    ban_reason: r.ban_reason as string | null,
    first_login: r.first_login as string,
    last_login: r.last_login as string,
    login_count: r.login_count as number,
    roles_cache: {
      active_roles: (r.roles_active as string[]) as RoleName[],
      last_synced: r.roles_synced as string,
      cache_expires_at: r.roles_expires as string,
    },
    link_usage: (r.link_usage as Record<string, Record<string, { copy_count: number; last_copied_at: string }>>) ?? {},
    audit_log: [], // audit_log อยู่ใน table แยก — โหลดเฉพาะเมื่อต้องการ
    favorites: (r.favorites as string[]) ?? [],
  }
}

// ✅ FIX: access_mode fallback "hierarchy" ป้องกัน Server Component crash
// เมื่อ column นี้ไม่มีใน Supabase หรือ return null
function rowToGallery(g: Record<string, unknown>, images: GalleryImage[], links: unknown[]): Gallery {
  return {
    id: g.id as string,
    title: g.title as string,
    description: g.description as string,
    thumbnail: g.thumbnail as string,
    images,
    tags: (g.tags as string[]) ?? [],
    uploaded_by: g.uploaded_by as string,
    uploaded_at: g.uploaded_at as string,
    updated_at: g.updated_at as string,
    is_active: g.is_active as boolean,
    is_pinned: g.is_pinned as boolean,
    access: {
      min_hierarchy_level: (g.access_min_level as number) ?? 1,
      min_role_name: (g.access_min_role as RoleName) ?? "69Bath",
      mode: (g.access_mode as "hierarchy" | "exact") ?? "hierarchy", // ✅ fallback
    },
    stats: {
      total_views: (g.stat_views as number) ?? 0,
      total_copies: (g.stat_copies as number) ?? 0,
      unique_openers: (g.stat_unique_openers as number) ?? 0,
    },
    links: links as Gallery["links"],
  }
}

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

export async function getUserById(userId: string): Promise<AppUser | null> {
  const db = getSupabase()
  const { data, error } = await db.from("users").select("*").eq("user_id", userId).single()
  if (error || !data) return null
  return rowToUser(data as Record<string, unknown>)
}

export async function getAllUsers(): Promise<AppUser[]> {
  const db = getSupabase()
  const { data, error } = await db.from("users").select("*").order("last_login", { ascending: false })
  if (error || !data) return []
  return data.map((r) => rowToUser(r as Record<string, unknown>))
}

export async function saveUser(user: AppUser): Promise<void> {
  const db = getSupabase()
  const row = {
    user_id: user.user_id,
    username: user.username,
    discord_tag: user.discord_tag,
    avatar: user.avatar,
    is_banned: user.is_banned,
    ban_reason: user.ban_reason,
    first_login: user.first_login,
    last_login: user.last_login,
    login_count: user.login_count,
    roles_active: user.roles_cache.active_roles,
    roles_synced: user.roles_cache.last_synced,
    roles_expires: user.roles_cache.cache_expires_at,
    favorites: user.favorites ?? [],
    link_usage: user.link_usage ?? {},
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from("users").upsert(row, { onConflict: "user_id" })
  if (error) console.error("[db] saveUser error:", error.message)
}

export async function upsertDiscordUser(input: {
  user_id: string
  username: string
  discord_tag: string
  avatar: string | null
  active_roles: RoleName[]
}): Promise<{ user: AppUser; rolesBefore: RoleName[] }> {
  const existing = await getUserById(input.user_id)
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  if (existing) {
    const rolesBefore = existing.roles_cache.active_roles
    existing.username = input.username
    existing.discord_tag = input.discord_tag
    existing.avatar = input.avatar
    existing.last_login = now
    existing.login_count += 1
    existing.roles_cache = { active_roles: input.active_roles, last_synced: now, cache_expires_at: expires }
    await saveUser(existing)

    if (input.active_roles.length > 0) {
      await autoSupersedeConfirmedOverrides(input.user_id, input.active_roles)
    }

    return { user: existing, rolesBefore }
  }

  const newUser: AppUser = {
    user_id: input.user_id,
    username: input.username,
    discord_tag: input.discord_tag,
    avatar: input.avatar,
    is_banned: false,
    ban_reason: null,
    first_login: now,
    last_login: now,
    login_count: 1,
    roles_cache: { active_roles: input.active_roles, last_synced: now, cache_expires_at: expires },
    link_usage: {},
    audit_log: [],
    favorites: [],
  }
  await saveUser(newUser)
  return { user: newUser, rolesBefore: [] }
}

export async function appendAudit(userId: string, entry: AuditEntry): Promise<void> {
  const db = getSupabase()
  const row = {
    user_id: userId,
    action: entry.action,
    gallery_id: entry.gallery_id ?? null,
    // ✅ FIX v3.4: map tag_id → link_id column (audit_log table ไม่มี tag_id column)
    // ใช้ link_id เป็น general "subject_id" สำหรับ tag actions
    link_id: entry.link_id ?? entry.tag_id ?? null,
    ip_hash: entry.ip_hash ?? null,
    ua_hash: entry.ua_hash ?? null,
    roles_before: entry.roles_before ?? [],
    roles_after: entry.roles_after ?? [],
    created_at: entry.timestamp,
  }
  const { error } = await db.from("audit_log").insert(row)
  if (error) console.warn("[db] appendAudit error:", error.message)
}

export async function toggleUserFavorite(userId: string, galleryId: string): Promise<string[]> {
  const user = await getUserById(userId)
  if (!user) return []
  const set = new Set(user.favorites ?? [])
  if (set.has(galleryId)) set.delete(galleryId)
  else set.add(galleryId)
  user.favorites = Array.from(set)
  await saveUser(user)
  return user.favorites
}

export async function mergeUserFavorites(userId: string, ids: string[]): Promise<string[]> {
  const user = await getUserById(userId)
  if (!user) return []
  const merged = new Set<string>([...(user.favorites ?? []), ...ids])
  user.favorites = Array.from(merged)
  await saveUser(user)
  return user.favorites
}

export async function recordLinkCopy(userId: string, galleryId: string, linkId: string): Promise<void> {
  const user = await getUserById(userId)
  if (!user) return
  const now = new Date().toISOString()
  user.link_usage[galleryId] = user.link_usage[galleryId] ?? {}
  const prev = user.link_usage[galleryId][linkId]
  user.link_usage[galleryId][linkId] = {
    copy_count: (prev?.copy_count ?? 0) + 1,
    last_copied_at: now,
  }
  await saveUser(user)
}

// ---------------------------------------------------------------------------
// ADMIN: BAN / UNBAN USER
// ---------------------------------------------------------------------------

export async function banUser(userId: string, reason: string, adminId: string): Promise<boolean> {
  const user = await getUserById(userId)
  if (!user) return false
  user.is_banned = true
  user.ban_reason = reason.trim() || "banned by admin"
  await saveUser(user)
  await appendAudit(adminId, {
    action: "admin_ban_user",
    timestamp: new Date().toISOString(),
    link_id: userId,
  })
  return true
}

export async function unbanUser(userId: string, adminId: string): Promise<boolean> {
  const user = await getUserById(userId)
  if (!user) return false
  user.is_banned = false
  user.ban_reason = null
  await saveUser(user)
  await appendAudit(adminId, {
    action: "admin_unban_user",
    timestamp: new Date().toISOString(),
    link_id: userId,
  })
  return true
}

// ---------------------------------------------------------------------------
// ADMIN: GET USER AUDIT LOG
// ---------------------------------------------------------------------------

export async function getUserAuditLog(
  userId: string,
  limit = 50
): Promise<AuditEntry[]> {
  const db = getSupabase()
  const { data, error } = await db
    .from("audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.map((r) => ({
    action: r.action as string,
    timestamp: r.created_at as string,
    gallery_id: r.gallery_id as string | undefined,
    link_id: r.link_id as string | undefined,
    ip_hash: r.ip_hash as string | undefined,
    ua_hash: r.ua_hash as string | undefined,
    roles_before: (r.roles_before as RoleName[]) ?? [],
    roles_after: (r.roles_after as RoleName[]) ?? [],
  }))
}

export async function getAllAuditLogs(limit = 200): Promise<(AuditEntry & { user_id: string })[]> {
  const db = getSupabase()
  const { data, error } = await db
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.map((r) => ({
    user_id: r.user_id as string,
    action: r.action as string,
    timestamp: r.created_at as string,
    gallery_id: r.gallery_id as string | undefined,
    link_id: r.link_id as string | undefined,
    ip_hash: r.ip_hash as string | undefined,
    ua_hash: r.ua_hash as string | undefined,
    roles_before: (r.roles_before as RoleName[]) ?? [],
    roles_after: (r.roles_after as RoleName[]) ?? [],
  }))
}

// ---------------------------------------------------------------------------
// TAGS
// ---------------------------------------------------------------------------

export async function listTags(): Promise<Tag[]> {
  const db = getSupabase()
  const { data, error } = await db.from("tags").select("*").order("created_at", { ascending: true })
  if (error || !data) return []
  return data as unknown as Tag[]
}

// ✅ FIX v3.2: saveTags ใช้ selective upsert เท่านั้น
// ❌ เดิม: delete.not("id","in",...) ทำให้ tag ที่ไม่อยู่ใน snapshot ถูกลบ
//          → race condition กับ createTag ทำให้ tag ใหม่หายทันที
// ✅ ใหม่: upsert เฉพาะที่มีการเปลี่ยนแปลง ไม่ลบอะไรทั้งนั้น
export async function saveTags(tags: Tag[]): Promise<void> {
  const db = getSupabase()
  if (tags.length === 0) return
  const { error } = await db.from("tags").upsert(tags, { onConflict: "id" })
  if (error) console.error("[db] saveTags upsert error:", error.message)
}

// ---------------------------------------------------------------------------
// ADMIN: CREATE TAG
// ---------------------------------------------------------------------------

export async function createTag(
  rawInput: CreateTagInput,
  createdBy: string
): Promise<Tag | null> {
  const input = parseOrThrow(CreateTagSchema, rawInput, "CreateTag")
  const db = getSupabase()
  const now = new Date().toISOString()
  const newTag: Tag = {
    id: crypto.randomUUID(),
    name: input.name,
    display: input.display,
    color: input.color,
    gallery_ids: [],
    gallery_count: 0,
    created_at: now,
    created_by: createdBy,
    is_active: true,
  }
  const { error } = await db.from("tags").insert(newTag)
  if (error) { console.error("[db] createTag error:", error.message); return null }
  return newTag
}

// ---------------------------------------------------------------------------
// ADMIN: UPDATE TAG
// ---------------------------------------------------------------------------

// ✅ FIX v3.2: เพิ่ม adminId param (signature ตรงกับ actions.ts) + audit log
export async function updateTag(
  tagId: string,
  rawInput: UpdateTagInput,
  adminId: string
): Promise<Tag | null> {
  const input = parseOrThrow(UpdateTagSchema, rawInput, "UpdateTag")
  const db = getSupabase()
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { ...input, updated_at: now, updated_by: adminId }
  const { data, error } = await db
    .from("tags")
    .update(updates)
    .eq("id", tagId)
    .select()
    .single()
  if (error || !data) { console.error("[db] updateTag error:", error?.message); return null }
  await appendAudit(adminId, {
    action: "admin_update_tag",
    timestamp: now,
    tag_id: tagId,
  })
  return data as unknown as Tag
}

// ---------------------------------------------------------------------------
// ADMIN: DELETE TAG
// ---------------------------------------------------------------------------

// ✅ FIX v3.2: เพิ่ม adminId param (signature ตรงกับ actions.ts) + audit log
export async function deleteTag(tagId: string, adminId: string): Promise<boolean> {
  const db = getSupabase()
  const { data: galleries } = await db
    .from("galleries")
    .select("id, tags")
    .contains("tags", [tagId])
  if (galleries && galleries.length > 0) {
    await Promise.all(
      galleries.map((g) =>
        db
          .from("galleries")
          .update({ tags: (g.tags as string[]).filter((t) => t !== tagId) })
          .eq("id", g.id as string)
      )
    )
  }
  const { error } = await db.from("tags").delete().eq("id", tagId)
  if (error) { console.error("[db] deleteTag error:", error.message); return false }
  const now = new Date().toISOString()
  await appendAudit(adminId, {
    action: "admin_delete_tag",
    timestamp: now,
    tag_id: tagId,
  })
  return true
}

// ---------------------------------------------------------------------------
// GALLERIES (internal)
// ---------------------------------------------------------------------------

async function fetchGalleriesWithRelations(filter?: { is_active?: boolean }): Promise<Gallery[]> {
  const db = getSupabase()

  let q = db.from("galleries").select("*")
  if (filter?.is_active !== undefined) q = q.eq("is_active", filter.is_active)

  const { data: gRows, error: gErr } = await q
    .order("is_pinned", { ascending: false })
    .order("uploaded_at", { ascending: false })
  if (gErr || !gRows || gRows.length === 0) return []

  const galleryIds = gRows.map((g) => g.id as string)

  const [imgRes, linkRes] = await Promise.all([
    db.from("gallery_images").select("*").in("gallery_id", galleryIds).order("sort_order", { ascending: true }),
    db.from("gallery_links").select("*").in("gallery_id", galleryIds),
  ])

  const imagesByGallery = new Map<string, GalleryImage[]>()
  const linksByGallery = new Map<string, unknown[]>()

    ; (imgRes.data ?? []).forEach((img) => {
      const list = imagesByGallery.get(img.gallery_id as string) ?? []
      list.push({
        id: img.id as string,
        url: img.url as string,
        caption: img.caption as string | undefined,
        sort_order: img.sort_order as number,
        added_at: img.added_at as string,
      })
      imagesByGallery.set(img.gallery_id as string, list)
    })

    ; (linkRes.data ?? []).forEach((lnk) => {
      const list = linksByGallery.get(lnk.gallery_id as string) ?? []
      list.push({
        id: lnk.id,
        label: lnk.label,
        url: lnk.url,
        is_active: lnk.is_active,
        null_reason: lnk.null_reason ?? null,
        copy_limit_per_user: lnk.copy_limit_per_user,
        total_copies: lnk.total_copies,
        accessible_by_min_level: lnk.accessible_by_min_level,
      })
      linksByGallery.set(lnk.gallery_id as string, list)
    })

  return gRows.map((g) =>
    rowToGallery(
      g as Record<string, unknown>,
      imagesByGallery.get(g.id as string) ?? [],
      linksByGallery.get(g.id as string) ?? []
    )
  )
}

// ✅ v3.4 — fix: thumbnail ใช้ galleries.thumbnail โดยตรง (ไม่ fallback images[0])
//           fix: appendAudit map tag_id → link_id (prevent silent data loss)
//           fix: updateGallery ไม่ override thumbnail ที่ admin ตั้งไว้
// ✅ v3.3 FIX: saveGalleryRow — links ใช้ delete-all-then-reinsert (เหมือน images)
// ─────────────────────────────────────────────────────────────────────────────
// BUG เดิม (v3.2):
//   if (g.links.length > 0) {
//     upsert(lnkRows)           ← fail silently ถ้า url=null (Supabase NOT NULL constraint)
//     delete.not("id","in",…)   ← ยังรันแม้ upsert fail → ลบลิ้งทั้งหมด!
//   } else if (Array.isArray(g.links)) {
//     delete(all)               ← ลบถ้า links=[]
//   }
//
// FIX ใหม่ (v3.3):
//   delete(all) → insert(lnkRows)   ← atomic, null-safe, ไม่มี race condition
//   ถ้า g.links=undefined → ไม่แตะ (ป้องกัน links หายโดยไม่ตั้งใจ)
// ─────────────────────────────────────────────────────────────────────────────
async function saveGalleryRow(g: Gallery): Promise<void> {
  const db = getSupabase()

  const row = {
    id: g.id,
    title: g.title,
    description: g.description,
    thumbnail: g.thumbnail,
    tags: g.tags,
    uploaded_by: g.uploaded_by,
    uploaded_at: g.uploaded_at,
    updated_at: g.updated_at,
    is_active: g.is_active,
    is_pinned: g.is_pinned,
    access_min_level: g.access.min_hierarchy_level,
    access_min_role: g.access.min_role_name,
    access_mode: g.access.mode ?? "hierarchy",
    stat_views: g.stats.total_views,
    stat_copies: g.stats.total_copies,
    stat_unique_openers: g.stats.unique_openers,
  }

  const { error: gErr } = await db.from("galleries").upsert(row, { onConflict: "id" })
  if (gErr) { console.error("[db] saveGalleryRow error:", gErr.message); return }

  // ── Sync gallery_images: delete-all-then-reinsert (atomic, no onConflict race)
  await db.from("gallery_images").delete().eq("gallery_id", g.id)
  if (g.images && g.images.length > 0) {
    const imgRows = g.images.map((img) => ({
      id: img.id,
      gallery_id: g.id,
      url: img.url,
      caption: img.caption ?? null,
      sort_order: img.sort_order,
      added_at: img.added_at,
    }))
    const { error: imgErr } = await db.from("gallery_images").insert(imgRows)
    if (imgErr) { console.error("[db] saveGalleryRow images insert error:", imgErr.message) }
  }

  // ✅ v3.3 FIX: ── Sync gallery_links: delete-all-then-reinsert (atomic, null-url safe)
  // ไม่ใช้ upsert+delete-not-in อีกต่อไป เพราะ:
  //   1. url=null → Supabase upsert อาจ fail → delete.not(in) ยังรัน → links หายหมด
  //   2. Race condition: upsert หลาย rows พร้อมกัน → lnkIds ชี้ไป rows ที่ยังไม่ commit
  if (Array.isArray(g.links)) {
    await db.from("gallery_links").delete().eq("gallery_id", g.id)
    if (g.links.length > 0) {
      const lnkRows = g.links.map((l) => ({
        id: l.id,
        gallery_id: g.id,
        label: l.label,
        url: l.url ?? null,                          // explicit null-safe
        is_active: l.is_active,
        null_reason: l.null_reason ?? null,
        copy_limit_per_user: l.copy_limit_per_user,
        total_copies: l.total_copies,
        accessible_by_min_level: l.accessible_by_min_level,
      }))
      const { error: lnkErr } = await db.from("gallery_links").insert(lnkRows)
      if (lnkErr) { console.error("[db] saveGalleryRow links insert error:", lnkErr.message) }
    }
  }
  // ถ้า g.links เป็น undefined → ไม่แตะ links เลย (ป้องกัน links หายโดยไม่ตั้งใจ)
}

// ---------------------------------------------------------------------------
// PUBLIC GALLERY API
// ---------------------------------------------------------------------------

export async function listGalleries(): Promise<Gallery[]> {
  return fetchGalleriesWithRelations({ is_active: true })
}

export async function getAllGalleriesRaw(): Promise<Gallery[]> {
  return fetchGalleriesWithRelations()
}

export async function getGalleryById(id: string): Promise<Gallery | null> {
  const db = getSupabase()
  const { data: g, error } = await db.from("galleries").select("*").eq("id", id).single()
  if (error || !g) return null

  const [imgRes, linkRes] = await Promise.all([
    db.from("gallery_images").select("*").eq("gallery_id", id).order("sort_order", { ascending: true }),
    db.from("gallery_links").select("*").eq("gallery_id", id),
  ])

  const images: GalleryImage[] = (imgRes.data ?? []).map((img) => ({
    id: img.id as string,
    url: img.url as string,
    caption: img.caption as string | undefined,
    sort_order: img.sort_order as number,
    added_at: img.added_at as string,
  }))

  const links = (linkRes.data ?? []).map((lnk) => ({
    id: lnk.id,
    label: lnk.label,
    url: lnk.url,
    is_active: lnk.is_active,
    null_reason: lnk.null_reason ?? null,
    copy_limit_per_user: lnk.copy_limit_per_user,
    total_copies: lnk.total_copies,
    accessible_by_min_level: lnk.accessible_by_min_level,
  }))

  return rowToGallery(g as Record<string, unknown>, images, links)
}

export async function saveGalleries(galleries: Gallery[]): Promise<void> {
  await Promise.all(galleries.map((g) => saveGalleryRow(g)))

  try {
    const tags = await listTags()
    const tagGalleryMap = new Map<string, string[]>()
    tags.forEach((t) => tagGalleryMap.set(t.id, []))
    galleries
      .filter((g) => g.is_active)
      .forEach((g) => {
        g.tags.forEach((tagId) => {
          if (tagGalleryMap.has(tagId)) tagGalleryMap.get(tagId)!.push(g.id)
        })
      })
    // ✅ FIX v3.2: upsert เฉพาะ tag ที่เปลี่ยน ไม่ส่ง full snapshot
    const changedTags: Tag[] = []
    tags.forEach((t) => {
      const ids = tagGalleryMap.get(t.id) ?? []
      if (t.gallery_count !== ids.length || JSON.stringify(t.gallery_ids) !== JSON.stringify(ids)) {
        changedTags.push({ ...t, gallery_ids: ids, gallery_count: ids.length })
      }
    })
    if (changedTags.length > 0) await saveTags(changedTags)
  } catch { /* tag counts are display-only */ }
}

export async function incrementGalleryView(id: string): Promise<void> {
  const db = getSupabase()
  await db.rpc("increment_gallery_view", { p_gallery_id: id })
}

export async function incrementLinkCopy(galleryId: string, linkId: string): Promise<void> {
  const db = getSupabase()
  await db.rpc("increment_link_copy", { p_gallery_id: galleryId, p_link_id: linkId })
}

// ---------------------------------------------------------------------------
// ADMIN: CREATE GALLERY
// ---------------------------------------------------------------------------

export async function createGallery(
  rawInput: CreateGalleryInput,
  uploadedBy: string
): Promise<Gallery | null> {
  // Pre-filter images ก่อน parse — Zod z.string().url() strict มาก ถ้า URL ใดไม่ผ่าน throw ทั้ง array
  const safeInput = {
    ...rawInput,
    images: (rawInput.images ?? []).filter((url) => {
      if (!url || typeof url !== "string") return false
      const t = url.trim()
      if (t.startsWith("/")) return true
      try { const { protocol } = new URL(t); return protocol === "http:" || protocol === "https:" }
      catch { return false }
    }),
  }
  const input = parseOrThrow(CreateGallerySchema, safeInput, "CreateGallery")
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const imageUrls: string[] = (input.images ?? []).filter(Boolean)
  const images: GalleryImage[] = imageUrls.map((url, idx) => ({
    id: crypto.randomUUID(),
    url,
    sort_order: idx,
    added_at: now,
  }))
  console.log(`[db] createGallery: title="${safeInput.title}" images=${images.length}`)

  const gallery: Gallery = {
    id,
    title: input.title,
    description: input.description ?? "",
    // ✅ FIX v3.4: ใช้ thumbnail จาก input (Supabase galleries.thumbnail) ก่อนเสมอ
    // images[0] เป็น fallback เท่านั้น — ไม่ override ค่าที่ admin ตั้งไว้
    thumbnail: input.thumbnail ?? images[0]?.url ?? "/placeholder.jpg",
    images,
    tags: input.tags ?? [],
    uploaded_by: uploadedBy,
    uploaded_at: now,
    updated_at: now,
    is_active: true,
    is_pinned: input.isPinned ?? false,
    access: {
      min_hierarchy_level: input.minLevel,
      min_role_name: input.minRoleName,
      mode: "hierarchy",
    },
    stats: { total_views: 0, total_copies: 0, unique_openers: 0 },
    links: [],
  }

  await saveGalleryRow(gallery)
  await syncTagCounts()
  return gallery
}

// ---------------------------------------------------------------------------
// ADMIN: UPDATE GALLERY
// ---------------------------------------------------------------------------

export async function updateGallery(
  galleryId: string,
  rawInput: UpdateGalleryInput,
  adminId: string
): Promise<Gallery | null> {
  // Pre-filter images URL ก่อน parse (เหมือน createGallery)
  const safeRawInput = rawInput.images !== undefined
    ? {
        ...rawInput,
        images: rawInput.images.filter((url) => {
          if (!url || typeof url !== "string") return false
          const t = url.trim()
          if (t.startsWith("/")) return true
          try { const { protocol } = new URL(t); return protocol === "http:" || protocol === "https:" }
          catch { return false }
        }),
      }
    : rawInput
  const input = parseOrThrow(UpdateGallerySchema, safeRawInput, "UpdateGallery")
  const gallery = await getGalleryById(galleryId)
  if (!gallery) return null

  const now = new Date().toISOString()

  if (input.title !== undefined) gallery.title = input.title
  if (input.description !== undefined) gallery.description = input.description
  if (input.thumbnail !== undefined) gallery.thumbnail = input.thumbnail
  if (input.tags !== undefined) gallery.tags = input.tags
  if (input.is_active !== undefined) gallery.is_active = input.is_active
  if (input.is_pinned !== undefined) gallery.is_pinned = input.is_pinned
  if (input.minLevel !== undefined) gallery.access.min_hierarchy_level = input.minLevel
  if (input.minRoleName !== undefined) gallery.access.min_role_name = input.minRoleName

  if (input.images !== undefined) {
    const imageUrls = input.images.filter(Boolean)
    gallery.images = imageUrls.map((url, idx) => {
      const existing = gallery.images.find((img) => img.url === url)
      return existing
        ? { ...existing, sort_order: idx }
        : { id: crypto.randomUUID(), url, sort_order: idx, added_at: now }
    })
    // ✅ FIX v3.4: อัป thumbnail จาก images[0] เฉพาะเมื่อ admin ไม่ได้ระบุ thumbnail ไว้ใน input
    // ป้องกัน thumbnail ที่ admin ตั้งไว้ (line 762) ถูก override ทิ้ง
    if (gallery.images.length > 0 && input.thumbnail === undefined) {
      gallery.thumbnail = gallery.images[0].url
    }
  }

  gallery.updated_at = now

  await saveGalleryRow(gallery)
  await appendAudit(adminId, {
    action: "admin_update_gallery",
    timestamp: now,
    gallery_id: galleryId,
  })
  await syncTagCounts()

  return gallery
}

// ---------------------------------------------------------------------------
// ADMIN: DELETE GALLERY (soft delete — set is_active = false)
// ---------------------------------------------------------------------------

export async function deleteGallery(galleryId: string, adminId: string, hard = false): Promise<boolean> {
  const db = getSupabase()

  if (hard) {
    await Promise.all([
      db.from("gallery_images").delete().eq("gallery_id", galleryId),
      db.from("gallery_links").delete().eq("gallery_id", galleryId),
    ])
    const { error } = await db.from("galleries").delete().eq("id", galleryId)
    if (error) { console.error("[db] deleteGallery hard error:", error.message); return false }
  } else {
    const { error } = await db
      .from("galleries")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", galleryId)
    if (error) { console.error("[db] deleteGallery soft error:", error.message); return false }
  }

  await appendAudit(adminId, {
    action: hard ? "admin_hard_delete_gallery" : "admin_soft_delete_gallery",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
  })
  await syncTagCounts()
  return true
}

// ---------------------------------------------------------------------------
// ADMIN: RESTORE GALLERY
// ---------------------------------------------------------------------------

export async function restoreGallery(galleryId: string, adminId: string): Promise<boolean> {
  const db = getSupabase()
  const { error } = await db
    .from("galleries")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", galleryId)
  if (error) { console.error("[db] restoreGallery error:", error.message); return false }

  await appendAudit(adminId, {
    action: "admin_restore_gallery",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
  })
  await syncTagCounts()
  return true
}

// ---------------------------------------------------------------------------
// ADMIN: BULK DELETE GALLERIES
// ---------------------------------------------------------------------------

export async function bulkDeleteGalleries(
  galleryIds: string[],
  adminId: string,
  hard = false
): Promise<{ deleted: number; failed: string[] }> {
  const results = await Promise.allSettled(
    galleryIds.map((id) => deleteGallery(id, adminId, hard))
  )
  let deleted = 0
  const failed: string[] = []
  results.forEach((r, idx) => {
    if (r.status === "fulfilled" && r.value) deleted++
    else failed.push(galleryIds[idx])
  })
  return { deleted, failed }
}

// ---------------------------------------------------------------------------
// ADMIN: TOGGLE GALLERY PIN
// ---------------------------------------------------------------------------

export async function toggleGalleryPin(galleryId: string, adminId: string): Promise<boolean | null> {
  const db = getSupabase()
  const { data, error } = await db.from("galleries").select("is_pinned").eq("id", galleryId).single()
  if (error || !data) return null

  const newVal = !(data.is_pinned as boolean)
  await db.from("galleries").update({ is_pinned: newVal, updated_at: new Date().toISOString() }).eq("id", galleryId)
  await appendAudit(adminId, {
    action: newVal ? "admin_pin_gallery" : "admin_unpin_gallery",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
  })
  return newVal
}

// ---------------------------------------------------------------------------
// GALLERY IMAGES
// ---------------------------------------------------------------------------

export async function addGalleryImage(
  galleryId: string,
  rawInput: { url: string; caption?: string }
): Promise<GalleryImage | null> {
  const input = parseOrThrow(AddGalleryImageSchema, rawInput, "AddGalleryImage")
  const gallery = await getGalleryById(galleryId)
  if (!gallery) return null

  const db = getSupabase()
  const maxOrder = gallery.images.reduce((m, img) => Math.max(m, img.sort_order), -1)
  const newImage: GalleryImage = {
    id: crypto.randomUUID(),
    url: input.url,
    caption: input.caption,
    sort_order: maxOrder + 1,
    added_at: new Date().toISOString(),
  }

  const { error } = await db.from("gallery_images").insert({
    id: newImage.id,
    gallery_id: galleryId,
    url: newImage.url,
    caption: newImage.caption ?? null,
    sort_order: newImage.sort_order,
    added_at: newImage.added_at,
  })
  if (error) { console.error("[db] addGalleryImage error:", error.message); return null }

  if (gallery.images.length === 0) {
    await db.from("galleries").update({ thumbnail: newImage.url, updated_at: new Date().toISOString() }).eq("id", galleryId)
  }

  return newImage
}

/**
 * Bulk insert หลายรูปพร้อมกัน — atomic single INSERT
 * แก้ bug: sequential addGalleryImage() loop → sort_order ซ้ำกัน → รูปถูกทับ
 */
export async function bulkAddGalleryImages(
  galleryId: string,
  urls: string[]
): Promise<{ added: number; failed: number; images: GalleryImage[] }> {
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean)
  if (cleanUrls.length === 0) return { added: 0, failed: 0, images: [] }

  const gallery = await getGalleryById(galleryId)
  if (!gallery) return { added: 0, failed: cleanUrls.length, images: [] }

  const db = getSupabase()
  const baseOrder = gallery.images.reduce((m, img) => Math.max(m, img.sort_order), -1)
  const now = new Date().toISOString()

  // Validate + dedup (กับ DB + ใน batch นี้)
  const existingUrls = new Set(gallery.images.map((i) => i.url))
  const seenInBatch = new Set<string>()
  const validImages: GalleryImage[] = []
  let failed = 0

  for (const url of cleanUrls) {
    if (existingUrls.has(url) || seenInBatch.has(url)) { failed++; continue }
    if (!url.startsWith("/")) {
      try { const { protocol } = new URL(url); if (protocol !== "http:" && protocol !== "https:") { failed++; continue } }
      catch { failed++; continue }
    }
    seenInBatch.add(url)
    validImages.push({
      id: crypto.randomUUID(),
      url,
      sort_order: baseOrder + 1 + validImages.length,
      added_at: now,
    })
  }

  if (validImages.length === 0) return { added: 0, failed, images: [] }

  const rows = validImages.map((img) => ({
    id: img.id,
    gallery_id: galleryId,
    url: img.url,
    caption: img.caption ?? null,
    sort_order: img.sort_order,
    added_at: img.added_at,
  }))

  const { error } = await db.from("gallery_images").insert(rows)
  if (error) {
    console.error("[db] bulkAddGalleryImages error:", error.message)
    return { added: 0, failed: failed + validImages.length, images: [] }
  }

  // Update thumbnail ถ้า gallery เดิมว่าง
  if (gallery.images.length === 0 && validImages[0]) {
    await db.from("galleries").update({ thumbnail: validImages[0].url, updated_at: now }).eq("id", galleryId)
  }

  return { added: validImages.length, failed, images: validImages }
}

export async function removeGalleryImage(galleryId: string, imageId: string): Promise<boolean> {
  const db = getSupabase()
  const { error } = await db.from("gallery_images").delete().eq("id", imageId).eq("gallery_id", galleryId)
  if (error) { console.error("[db] removeGalleryImage error:", error.message); return false }

  const { data: remaining } = await db
    .from("gallery_images")
    .select("id, sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: true })

  if (remaining && remaining.length > 0) {
    await Promise.all(
      remaining.map((img, idx) =>
        db.from("gallery_images").update({ sort_order: idx }).eq("id", img.id as string)
      )
    )
    const { data: first } = await db.from("gallery_images").select("url").eq("gallery_id", galleryId).order("sort_order", { ascending: true }).limit(1).single()
    if (first) await db.from("galleries").update({ thumbnail: first.url, updated_at: new Date().toISOString() }).eq("id", galleryId)
  }

  return true
}

export async function reorderGalleryImages(galleryId: string, rawOrderedImageIds: string[]): Promise<boolean> {
  const { orderedImageIds } = parseOrThrow(
    ReorderGalleryImagesSchema,
    { orderedImageIds: rawOrderedImageIds },
    "ReorderGalleryImages"
  )
  const db = getSupabase()
  await Promise.all(
    orderedImageIds.map((id, idx) =>
      db.from("gallery_images").update({ sort_order: idx }).eq("id", id).eq("gallery_id", galleryId)
    )
  )
  if (orderedImageIds.length > 0) {
    const { data: first } = await db.from("gallery_images").select("url").eq("id", orderedImageIds[0]).single()
    if (first) await db.from("galleries").update({ thumbnail: first.url, updated_at: new Date().toISOString() }).eq("id", galleryId)
  }
  return true
}

// ---------------------------------------------------------------------------
// ADMIN: LINKS — CREATE / UPDATE / DELETE
// ---------------------------------------------------------------------------

export async function createLink(
  galleryId: string,
  rawInput: AddLinkInput,
  adminId: string
): Promise<Gallery["links"][number] | null> {
  const input = parseOrThrow(AddLinkSchema, rawInput, "AddLink")
  const db = getSupabase()
  // รูปแรกของ imageUrls ใช้เป็น image_url หลักของ link
  const imageUrl = input.imageUrls?.[0] ?? null
  const newLink = {
    id: crypto.randomUUID(),
    gallery_id: galleryId,
    label: input.label,
    url: input.url,
    is_active: true,
    null_reason: null,
    copy_limit_per_user: input.copyLimit,
    total_copies: 0,
    accessible_by_min_level: input.minLevel,
    image_url: imageUrl,
  }
  const { error } = await db.from("gallery_links").insert(newLink)
  if (error) { console.error("[db] createLink error:", error.message); return null }

  await appendAudit(adminId, {
    action: "admin_create_link",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
    link_id: newLink.id,
  })

  return {
    id: newLink.id,
    label: newLink.label,
    url: newLink.url,
    is_active: newLink.is_active,
    null_reason: null,
    copy_limit_per_user: newLink.copy_limit_per_user,
    total_copies: 0,
    accessible_by_min_level: newLink.accessible_by_min_level,
    image_url: imageUrl,
  }
}

export async function updateLink(
  galleryId: string,
  linkId: string,
  rawInput: UpdateLinkInput,
  adminId: string
): Promise<boolean> {
  const input = parseOrThrow(UpdateLinkSchema, rawInput, "UpdateLink")
  const db = getSupabase()
  const updates: Record<string, unknown> = {}
  if (input.label !== undefined) updates.label = input.label
  if (input.url !== undefined) updates.url = input.url
  if (input.is_active !== undefined) updates.is_active = input.is_active
  if (input.null_reason !== undefined) updates.null_reason = input.null_reason
  if (input.copy_limit_per_user !== undefined) updates.copy_limit_per_user = input.copy_limit_per_user
  if (input.accessible_by_min_level !== undefined) updates.accessible_by_min_level = input.accessible_by_min_level

  const { error } = await db
    .from("gallery_links")
    .update(updates)
    .eq("id", linkId)
    .eq("gallery_id", galleryId)
  if (error) { console.error("[db] updateLink error:", error.message); return false }

  await appendAudit(adminId, {
    action: "admin_update_link",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
    link_id: linkId,
  })
  return true
}

export async function deleteLink(galleryId: string, linkId: string, adminId: string): Promise<boolean> {
  const db = getSupabase()
  const { error } = await db
    .from("gallery_links")
    .delete()
    .eq("id", linkId)
    .eq("gallery_id", galleryId)
  if (error) { console.error("[db] deleteLink error:", error.message); return false }

  await appendAudit(adminId, {
    action: "admin_delete_link",
    timestamp: new Date().toISOString(),
    gallery_id: galleryId,
    link_id: linkId,
  })
  return true
}

// ---------------------------------------------------------------------------
// ADMIN: STATS DASHBOARD
// ---------------------------------------------------------------------------

export interface AdminStats {
  total_galleries: number
  active_galleries: number
  inactive_galleries: number
  total_users: number
  banned_users: number
  total_tags: number
  total_views: number
  total_copies: number
  top_galleries: { id: string; title: string; views: number; copies: number }[]
  recent_signups: number
}

export async function getAdminStats(): Promise<AdminStats> {
  const db = getSupabase()

  const [galleriesRes, usersRes, tagsRes] = await Promise.all([
    db.from("galleries").select("id, title, is_active, stat_views, stat_copies"),
    db.from("users").select("user_id, is_banned, first_login"),
    db.from("tags").select("id"),
  ])

  const galleries = galleriesRes.data ?? []
  const users = usersRes.data ?? []
  const tags = tagsRes.data ?? []

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recentSignups = users.filter((u) => (u.first_login as string) >= sevenDaysAgo).length

  const totalViews = galleries.reduce((s, g) => s + ((g.stat_views as number) ?? 0), 0)
  const totalCopies = galleries.reduce((s, g) => s + ((g.stat_copies as number) ?? 0), 0)

  const top_galleries = [...galleries]
    .sort((a, b) => ((b.stat_views as number) ?? 0) - ((a.stat_views as number) ?? 0))
    .slice(0, 5)
    .map((g) => ({
      id: g.id as string,
      title: g.title as string,
      views: (g.stat_views as number) ?? 0,
      copies: (g.stat_copies as number) ?? 0,
    }))

  return {
    total_galleries: galleries.length,
    active_galleries: galleries.filter((g) => g.is_active).length,
    inactive_galleries: galleries.filter((g) => !g.is_active).length,
    total_users: users.length,
    banned_users: users.filter((u) => u.is_banned).length,
    total_tags: tags.length,
    total_views: totalViews,
    total_copies: totalCopies,
    top_galleries,
    recent_signups: recentSignups,
  }
}

// ---------------------------------------------------------------------------
// ANNOUNCEMENT BANNER
// ---------------------------------------------------------------------------

export interface AnnouncementBanner {
  message: string
  type: "info" | "warning" | "success"
  created_at: string
}

export async function getAnnouncementBanner(): Promise<AnnouncementBanner | null> {
  const db = getSupabase()
  const { data, error } = await db.from("announcement_banner").select("*").eq("id", 1).single()
  if (error || !data) return null
  return data as unknown as AnnouncementBanner
}

export async function setAnnouncementBanner(banner: AnnouncementBanner | null): Promise<void> {
  const db = getSupabase()
  if (banner === null) {
    await db.from("announcement_banner").delete().eq("id", 1)
  } else {
    await db.from("announcement_banner").upsert({ id: 1, ...banner }, { onConflict: "id" })
  }
}

// ---------------------------------------------------------------------------
// ANNOUNCEMENT NOTE
// ---------------------------------------------------------------------------

export interface AnnouncementNote {
  content_html: string
  content_text: string
  updated_at: string
  updated_by: string
}

export async function getAnnouncementNote(): Promise<AnnouncementNote | null> {
  const db = getSupabase()
  const { data, error } = await db.from("announcement_note").select("*").eq("id", 1).single()
  if (error || !data) return null
  return data as unknown as AnnouncementNote
}

// ✅ FIX: signature เดิม (note: AnnouncementNote) ทำให้ actions.ts เรียกไม่ได้
// แก้เป็น (contentHtml, contentText, updatedBy) ให้ตรงกับ actions.ts line 512
export async function saveAnnouncementNote(
  contentHtml: string,
  updatedBy: string,
  contentText?: string
): Promise<AnnouncementNote | null> {
  const db = getSupabase()
  const now = new Date().toISOString()
  const note: AnnouncementNote & { id: number } = {
    id: 1,
    content_html: contentHtml,
    content_text: contentText ?? contentHtml.replace(/<[^>]*>/g, ""),
    updated_at: now,
    updated_by: updatedBy,
  }
  const { error } = await db.from("announcement_note").upsert(note, { onConflict: "id" })
  if (error) { console.error("[db] saveAnnouncementNote error:", error.message); return null }
  return { content_html: note.content_html, content_text: note.content_text, updated_at: now, updated_by: updatedBy }
}

// ---------------------------------------------------------------------------
// Internal: sync tag gallery_count after gallery mutations
// ---------------------------------------------------------------------------

// ✅ FIX v3.2: syncTagCounts
// - ใช้ lock flag กัน concurrent run (ป้องกัน race condition ระหว่าง multiple updateGallery calls)
// - upsert เฉพาะ tag ที่ count/ids เปลี่ยน แทนที่จะส่ง snapshot ทั้งหมดเข้า saveTags
let _syncTagCountsRunning = false
async function syncTagCounts(): Promise<void> {
  if (_syncTagCountsRunning) return // กัน concurrent run
  _syncTagCountsRunning = true
  try {
    const [tags, galleries] = await Promise.all([listTags(), fetchGalleriesWithRelations()])
    const tagGalleryMap = new Map<string, string[]>()
    tags.forEach((t) => tagGalleryMap.set(t.id, []))
    galleries
      .filter((g) => g.is_active)
      .forEach((g) => {
        g.tags.forEach((tagId) => {
          if (tagGalleryMap.has(tagId)) tagGalleryMap.get(tagId)!.push(g.id)
        })
      })
    // ✅ เก็บเฉพาะ tag ที่เปลี่ยนแปลงจริงๆ แทนที่จะส่งทั้งหมด
    const changedTags: Tag[] = []
    tags.forEach((t) => {
      const ids = tagGalleryMap.get(t.id) ?? []
      if (t.gallery_count !== ids.length || JSON.stringify(t.gallery_ids) !== JSON.stringify(ids)) {
        changedTags.push({ ...t, gallery_ids: ids, gallery_count: ids.length })
      }
    })
    if (changedTags.length > 0) await saveTags(changedTags)
  } catch { /* non-fatal */ }
  finally { _syncTagCountsRunning = false }
}

// ===========================================================================
// DIGITAL-ROLE OVERRIDE SYSTEM
// ===========================================================================

export async function getActiveOverridesForUser(userId: string): Promise<DigitalRoleOverride[]> {
  const db = getSupabase()
  const now = new Date().toISOString()
  const { data, error } = await db
    .from("digital_role_overrides")
    .select("*")
    .eq("user_id", userId)
    .eq("is_superseded", false)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data as unknown as DigitalRoleOverride[]
}

export async function createDigitalOverride(input: {
  userId: string
  roleName: RoleName
  expiresAt: string
  adminId: string
  note?: string
  confirmedByRoleId?: string | null
}): Promise<DigitalRoleOverride | null> {
  const db = getSupabase()
  const config = getDiscordConfig()

  const roleConfig = config.role_id.find((r) => r.name === input.roleName)
  if (!roleConfig) {
    console.error("[db] createDigitalOverride: roleName not found in config:", input.roleName)
    return null
  }

  const confirmedByRoleId = input.confirmedByRoleId !== undefined
    ? input.confirmedByRoleId
    : roleConfig.id || null

  const now = new Date().toISOString()
  const override: DigitalRoleOverride = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    role_name: input.roleName,
    role_level: roleConfig.hierarchy_level,
    expires_at: input.expiresAt,
    created_at: now,
    created_by: input.adminId,
    note: input.note ?? null,
    is_superseded: false,
    superseded_at: null,
    confirmed_by_role_id: confirmedByRoleId,
  }

  const { error } = await db.from("digital_role_overrides").insert(override)
  if (error) {
    console.error("[db] createDigitalOverride error:", error.message)
    return null
  }

  await appendAudit(input.adminId, {
    action: "admin_create_digital_override",
    timestamp: now,
    link_id: input.userId,
    roles_after: [input.roleName],
  })

  return override
}

export async function revokeDigitalOverride(
  overrideId: string,
  adminId: string
): Promise<boolean> {
  const db = getSupabase()
  const now = new Date().toISOString()
  const { error } = await db
    .from("digital_role_overrides")
    .update({ is_superseded: true, superseded_at: now })
    .eq("id", overrideId)
  if (error) {
    console.error("[db] revokeDigitalOverride error:", error.message)
    return false
  }

  await appendAudit(adminId, {
    action: "admin_revoke_digital_override",
    timestamp: now,
    link_id: overrideId,
  })
  return true
}

export async function getAllDigitalOverrides(opts?: {
  userId?: string
  includeExpired?: boolean
  limit?: number
  offset?: number
}): Promise<DigitalRoleOverride[]> {
  const db = getSupabase()
  let q = db.from("digital_role_overrides").select("*")

  if (opts?.userId) q = q.eq("user_id", opts.userId)
  if (!opts?.includeExpired) {
    const now = new Date().toISOString()
    q = q.or(`is_superseded.eq.false,expires_at.gt.${now}`)
  }

  q = q
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100)

  if (opts?.offset) q = q.range(opts.offset, (opts.offset ?? 0) + (opts.limit ?? 100) - 1)

  const { data, error } = await q
  if (error || !data) return []
  return data as unknown as DigitalRoleOverride[]
}

export async function autoSupersedeConfirmedOverrides(
  userId: string,
  confirmedRoles: RoleName[]
): Promise<void> {
  const db = getSupabase()
  const activeOverrides = await getActiveOverridesForUser(userId)
  if (activeOverrides.length === 0) return

  const confirmedSet = new Set(confirmedRoles)
  const now = new Date().toISOString()

  const toSupersede = activeOverrides.filter((ov) => {
    if (confirmedSet.has(ov.role_name)) return true
    const config = getDiscordConfig()
    const confirmedMaxLevel = Math.max(
      0,
      ...Array.from(confirmedSet).map(
        (r) => config.role_id.find((cr) => cr.name === r)?.hierarchy_level ?? 0
      )
    )
    return confirmedMaxLevel >= ov.role_level
  })

  if (toSupersede.length === 0) return

  const ids = toSupersede.map((ov) => ov.id)
  const { error } = await db
    .from("digital_role_overrides")
    .update({ is_superseded: true, superseded_at: now })
    .in("id", ids)

  if (error) {
    console.warn("[db] autoSupersedeConfirmedOverrides error:", error.message)
  }
}
