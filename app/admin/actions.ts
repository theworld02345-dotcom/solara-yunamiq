"use server"

/**
 * app/admin/actions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js Server Actions สำหรับ Admin CRUD ทั้งหมด
 * วางไฟล์ที่:  app/admin/actions.ts
 *
 * ใช้งาน: import { actionCreateGallery, actionUpdateGallery, ... } from "@/app/admin/actions"
 *
 * ทุก action:
 *   1. ตรวจสิทธิ์ว่าเป็น owner หรือไม่
 *   2. Validate input ผ่าน Zod (ใน db.ts)
 *   3. เรียก db function
 *   4. revalidatePath เพื่อ refresh Next.js cache
 *   5. return { ok, data?, error? }
 *
 * ✅ v1.1 — actionUpdateGallery เพิ่ม notifyGalleryUpdated webhook
 *           ส่งข้อมูลการแก้ไขพร้อม codeblock links ไปยัง Admin channel
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth"
import {
  createGallery,
  updateGallery,
  deleteGallery,
  restoreGallery,
  bulkDeleteGalleries,
  toggleGalleryPin,
  createTag,
  updateTag,
  deleteTag,
  createLink,
  updateLink,
  deleteLink,
  banUser,
  unbanUser,
  getAdminStats,
  getUserAuditLog,
  getAllAuditLogs,
  setAnnouncementBanner,
  saveAnnouncementNote,
  addGalleryImage,
  bulkAddGalleryImages,
  removeGalleryImage,
  reorderGalleryImages,
  getAnnouncementBanner,
  getAnnouncementNote,
  getAllGalleriesRaw,
  getAllUsers,
  getUserById,
  getGalleryById,
  saveUser,
  appendAudit,
  listTags,
  type AdminStats,
  type AnnouncementBanner,
  type AnnouncementNote,
} from "@/lib/db"
import type {
  CreateGalleryInput,
  UpdateGalleryInput,
  CreateTagInput,
  UpdateTagInput,
  AddLinkInput,
  UpdateLinkInput,
} from "@/lib/validate"
import type { Gallery, Tag, AppUser, AuditEntry, RoleName } from "@/lib/types"
import {
  notifyNewGallery,
  notifyNewLink,
  notifyGalleryUpdated,
  logUserBan,
  logUserUnban,
  logAdminAction,
  buildGalleryShareUrl,
} from "@/lib/webhooks"

// ─── Response wrapper ──────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ─── Auth guard ────────────────────────────────────────────────────────────

async function requireOwner(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "ไม่ได้เข้าสู่ระบบ" }
  if (!session.is_owner) return { ok: false, error: "ไม่มีสิทธิ์ admin" }
  return { ok: true, userId: session.user_id }
}

// ─── GALLERY ACTIONS ───────────────────────────────────────────────────────

/**
 * สร้าง gallery ใหม่
 * @param notifyMode
 *   "now"  — แจ้ง Discord ทันทีหลังสร้าง (ไม่มีลิ้ง)
 *   "none" — ไม่แจ้ง (จะแจ้งเองเมื่อเพิ่มลิ้ง)
 */
export async function actionCreateGallery(
  input: CreateGalleryInput,
  notifyMode: "now" | "none" = "none"
): Promise<ActionResult<Gallery>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const gallery = await createGallery(input, auth.userId)
  if (!gallery) return { ok: false, error: "ไม่สามารถสร้าง gallery ได้" }

  // ─── Product Webhook: แจ้งสินค้าใหม่ทันที (ถ้า admin เลือก) ─────────
  if (notifyMode === "now") {
    notifyNewGallery({
      galleryId: gallery.id,
      title: gallery.title,
      description: gallery.description,
      // ✅ FIX v3.4: ดึง thumbnail จาก galleries.thumbnail โดยตรง ไม่ fallback ไป images[0]
      thumbnail: gallery.thumbnail || null,
      minRole: gallery.access.min_role_name,
      shareUrl: buildGalleryShareUrl(gallery.id),
    }).catch(() => {}) // fire-and-forget — ไม่ให้ webhook error ทำให้ action fail
  }

  // ─── Admin Webhook ────────────────────────────────────────────────────
  logAdminAction({
    adminId: auth.userId,
    action: "create_gallery",
    detail: `"${gallery.title}" (id: ${gallery.id}) | notify: ${notifyMode}`,
  }).catch(() => {})

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/admin/galleries")
  return { ok: true, data: gallery }
}

/**
 * แก้ไข gallery
 * ✅ v1.1: เพิ่ม notifyGalleryUpdated → ส่ง embed พร้อม codeblock links ไป Admin channel
 */
export async function actionUpdateGallery(
  galleryId: string,
  input: UpdateGalleryInput
): Promise<ActionResult<Gallery>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const gallery = await updateGallery(galleryId, input, auth.userId)
  if (!gallery) return { ok: false, error: "ไม่พบ gallery หรืออัปเดตล้มเหลว" }

  // ─── Admin Webhook: แจ้งการแก้ไข พร้อม codeblock links ────────────
  // fire-and-forget เสมอ — ไม่ให้ webhook error ทำให้ action fail
  notifyGalleryUpdated({
    galleryId:   gallery.id,
    title:       gallery.title,
    description: gallery.description,
    thumbnail:   gallery.thumbnail || null,
    minRole:     gallery.access.min_role_name,
    shareUrl:    buildGalleryShareUrl(gallery.id),
    links:       gallery.links.map((l) => ({
      label:     l.label,
      url:       l.url ?? null,
      is_active: l.is_active,
    })),
    tags:        gallery.tags,
    changedBy:   auth.userId,
  }).catch(() => {})

  revalidatePath("/")
  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: gallery }
}

/** ลบ gallery (soft delete by default) */
export async function actionDeleteGallery(
  galleryId: string,
  hard = false
): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await deleteGallery(galleryId, auth.userId, hard)
  if (!ok) return { ok: false, error: "ลบไม่สำเร็จ" }

  logAdminAction({
    adminId: auth.userId,
    action: hard ? "hard_delete_gallery" : "soft_delete_gallery",
    detail: `gallery: ${galleryId}`,
  }).catch(() => {})

  revalidatePath("/")
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

/** กู้คืน gallery ที่ถูก soft delete */
export async function actionRestoreGallery(galleryId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await restoreGallery(galleryId, auth.userId)
  if (!ok) return { ok: false, error: "กู้คืนไม่สำเร็จ" }

  revalidatePath("/")
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

/** ลบหลาย gallery พร้อมกัน */
export async function actionBulkDeleteGalleries(
  galleryIds: string[],
  hard = false
): Promise<ActionResult<{ deleted: number; failed: string[] }>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const result = await bulkDeleteGalleries(galleryIds, auth.userId, hard)

  logAdminAction({
    adminId: auth.userId,
    action: "bulk_delete_galleries",
    detail: `${result.deleted} ลบสำเร็จ | ${result.failed.length} ล้มเหลว | hard: ${hard}`,
  }).catch(() => {})

  revalidatePath("/")
  revalidatePath("/admin/galleries")
  return { ok: true, data: result }
}

/** toggle pin */
export async function actionTogglePin(galleryId: string): Promise<ActionResult<boolean>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const newVal = await toggleGalleryPin(galleryId, auth.userId)
  if (newVal === null) return { ok: false, error: "ไม่พบ gallery" }

  revalidatePath("/")
  revalidatePath("/admin/galleries")
  return { ok: true, data: newVal }
}

/** ดึงรายการ galleries ทั้งหมด (admin เห็นทั้ง active/inactive) */
export async function actionGetAllGalleries(): Promise<ActionResult<Gallery[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const galleries = await getAllGalleriesRaw()
  return { ok: true, data: galleries }
}

// ─── IMAGE ACTIONS ─────────────────────────────────────────────────────────

/** เพิ่มรูปใหม่เข้า gallery */
export async function actionAddImage(
  galleryId: string,
  url: string,
  caption?: string
): Promise<ActionResult<{ id: string; url: string; sort_order: number }>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const img = await addGalleryImage(galleryId, { url, caption })
  if (!img) return { ok: false, error: "เพิ่มรูปไม่สำเร็จ — ตรวจสอบ URL" }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: { id: img.id, url: img.url, sort_order: img.sort_order } }
}

/** ลบรูปออกจาก gallery */
export async function actionRemoveImage(galleryId: string, imageId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await removeGalleryImage(galleryId, imageId)
  if (!ok) return { ok: false, error: "ลบรูปไม่สำเร็จ" }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

/** เรียงลำดับรูปใหม่ */
export async function actionReorderImages(
  galleryId: string,
  orderedImageIds: string[]
): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await reorderGalleryImages(galleryId, orderedImageIds)
  if (!ok) return { ok: false, error: "เรียงลำดับไม่สำเร็จ" }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

/**
 * เพิ่มรูปหลายรูปพร้อมกัน (bulk) — atomic single INSERT
 * แก้ bug: sequential loop ทำให้ sort_order ซ้ำกัน → รูปถูกทับเหลือแค่ 1 รูป
 */
export async function actionBulkAddImages(
  galleryId: string,
  urls: string[]
): Promise<ActionResult<{ added: number; failed: number }>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const result = await bulkAddGalleryImages(galleryId, urls)

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: { added: result.added, failed: result.failed } }
}

// ─── LINK ACTIONS ──────────────────────────────────────────────────────────

/**
 * สร้าง link ใหม่
 * @param notifyOnLink  true (default) = แจ้ง Discord ทันทีว่ามีลิ้งใหม่
 */
export async function actionCreateLink(
  galleryId: string,
  input: AddLinkInput,
  notifyOnLink = true
): Promise<ActionResult<Gallery["links"][number]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const link = await createLink(galleryId, input, auth.userId)
  if (!link) return { ok: false, error: "สร้าง link ไม่สำเร็จ" }

  // ─── Product Webhook: แจ้งว่ามีลิ้งใหม่ ──────────────────────────────
  if (notifyOnLink) {
    // ✅ v3.5: AddLinkSchema.imageUrls = z.array() แล้ว → เป็น string[] ตลอด ไม่ต้อง split
    const rawImageUrls = input.imageUrls ?? []

    getGalleryById(galleryId).then((gallery) => {
      if (!gallery) return
      notifyNewLink({
        galleryId,
        galleryTitle: gallery.title,
        thumbnail: gallery.thumbnail || null,
        linkLabel: link.label,
        minRole: gallery.access.min_role_name,
        shareUrl: buildGalleryShareUrl(galleryId),
        linkImageUrls: rawImageUrls,
      }).catch(() => {})
    }).catch(() => {})
  }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  revalidatePath("/")
  return { ok: true, data: link }
}

/** แก้ไข link */
export async function actionUpdateLink(
  galleryId: string,
  linkId: string,
  input: UpdateLinkInput
): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await updateLink(galleryId, linkId, input, auth.userId)
  if (!ok) return { ok: false, error: "อัปเดต link ไม่สำเร็จ" }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

/** ลบ link */
export async function actionDeleteLink(galleryId: string, linkId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await deleteLink(galleryId, linkId, auth.userId)
  if (!ok) return { ok: false, error: "ลบ link ไม่สำเร็จ" }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}

// ─── TAG ACTIONS ───────────────────────────────────────────────────────────

/** สร้าง tag ใหม่ */
export async function actionCreateTag(input: CreateTagInput): Promise<ActionResult<Tag>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const tag = await createTag(input, auth.userId)
  if (!tag) return { ok: false, error: "สร้าง tag ไม่สำเร็จ" }

  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true, data: tag }
}

/** แก้ไข tag */
export async function actionUpdateTag(tagId: string, input: UpdateTagInput): Promise<ActionResult<Tag>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const tag = await updateTag(tagId, input, auth.userId)
  if (!tag) return { ok: false, error: "อัปเดต tag ไม่สำเร็จ" }

  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true, data: tag }
}

/** ลบ tag */
export async function actionDeleteTag(tagId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const ok = await deleteTag(tagId, auth.userId)
  if (!ok) return { ok: false, error: "ลบ tag ไม่สำเร็จ" }

  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true, data: undefined }
}

/** ดึง tags ทั้งหมด */
export async function actionGetTags(): Promise<ActionResult<Tag[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const tags = await listTags()
  return { ok: true, data: tags }
}

// ─── USER ACTIONS ──────────────────────────────────────────────────────────

/** ดึง users ทั้งหมด */
export async function actionGetAllUsers(): Promise<ActionResult<AppUser[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const users = await getAllUsers()
  return { ok: true, data: users }
}

/** แบน user */
export async function actionBanUser(userId: string, reason: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  if (!reason.trim()) return { ok: false, error: "ต้องระบุเหตุผลในการแบน" }

  const target = await getUserById(userId)
  const ok = await banUser(userId, reason, auth.userId)
  if (!ok) return { ok: false, error: "แบน user ไม่สำเร็จ — ไม่พบ user" }

  // ─── Admin Webhook ────────────────────────────────────────────────────
  logUserBan({
    adminId: auth.userId,
    targetId: userId,
    targetTag: target?.discord_tag ?? userId,
    reason,
  }).catch(() => {})

  revalidatePath("/admin/users")
  return { ok: true, data: undefined }
}

/** ปลดแบน user */
export async function actionUnbanUser(userId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const target = await getUserById(userId)
  const ok = await unbanUser(userId, auth.userId)
  if (!ok) return { ok: false, error: "ปลดแบนไม่สำเร็จ" }

  // ─── Admin Webhook ────────────────────────────────────────────────────
  logUserUnban({
    adminId: auth.userId,
    targetId: userId,
    targetTag: target?.discord_tag ?? userId,
  }).catch(() => {})

  revalidatePath("/admin/users")
  return { ok: true, data: undefined }
}

/** ดู audit log ของ user คนนั้น */
export async function actionGetUserAuditLog(
  userId: string,
  limit = 50
): Promise<ActionResult<AuditEntry[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const logs = await getUserAuditLog(userId, limit)
  return { ok: true, data: logs }
}

/** ดู audit log ทั้งระบบ */
export async function actionGetAllAuditLogs(
  limit = 200
): Promise<ActionResult<(AuditEntry & { user_id: string })[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const logs = await getAllAuditLogs(limit)
  return { ok: true, data: logs }
}

// ─── STATS ─────────────────────────────────────────────────────────────────

/** ดึง admin dashboard stats */
export async function actionGetAdminStats(): Promise<ActionResult<AdminStats>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const stats = await getAdminStats()
  return { ok: true, data: stats }
}

// ─── ANNOUNCEMENT ──────────────────────────────────────────────────────────

export async function actionSetBanner(
  banner: AnnouncementBanner | null
): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  await setAnnouncementBanner(banner)
  revalidatePath("/")
  return { ok: true, data: undefined }
}

export async function actionGetBanner(): Promise<ActionResult<AnnouncementBanner | null>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const b = await getAnnouncementBanner()
  return { ok: true, data: b }
}

export async function actionSaveNote(
  content: string,
  updatedBy?: string
): Promise<ActionResult<AnnouncementNote>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const note = await saveAnnouncementNote(content, updatedBy ?? auth.userId)
  if (!note) return { ok: false, error: "บันทึก note ไม่สำเร็จ" }

  revalidatePath("/")
  return { ok: true, data: note }
}

export async function actionGetNote(): Promise<ActionResult<AnnouncementNote | null>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const note = await getAnnouncementNote()
  return { ok: true, data: note }
}

// ─── USER MANUAL ADD ───────────────────────────────────────────────────────

export async function actionAddUserManually(input: {
  userId: string
  username: string
  note?: string
}): Promise<ActionResult<AppUser>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const trimmedId = input.userId.trim()
  if (!/^\d{17,20}$/.test(trimmedId)) {
    return { ok: false, error: "User ID ต้องเป็น Discord snowflake (ตัวเลข 17-20 หลัก)" }
  }

  const trimmedName = input.username.trim()
  if (!trimmedName) {
    return { ok: false, error: "ต้องระบุ Username" }
  }

  const existing = await getUserById(trimmedId)
  if (existing) {
    return { ok: false, error: `User ID ${trimmedId} มีในระบบอยู่แล้ว (${existing.username})` }
  }

  const now = new Date().toISOString()
  const newUser: AppUser = {
    user_id: trimmedId,
    username: trimmedName,
    discord_tag: trimmedName,
    avatar: null,
    is_banned: false,
    ban_reason: null,
    first_login: now,
    last_login: now,
    login_count: 0,
    roles_cache: {
      active_roles: [],
      last_synced: now,
      cache_expires_at: now,
    },
    link_usage: {},
    audit_log: [],
    favorites: [],
  }

  await saveUser(newUser)

  await appendAudit(auth.userId, {
    action: "admin_add_user_manual",
    timestamp: now,
    link_id: trimmedId,
  })

  logAdminAction({
    adminId: auth.userId,
    action: "add_user_manual",
    detail: `userId: ${trimmedId} | username: ${trimmedName}`,
  }).catch(() => {})

  revalidatePath("/admin")
  revalidatePath("/admin/users")
  return { ok: true, data: newUser }
}

// ─── GALLERY DESCRIPTION HTML ─────────────────────────────────────────────

/**
 * บันทึก description_html ของ gallery (rich text editor)
 * ใช้แทน description ปกติ แต่ยังเก็บ plain text description ไว้ด้วยสำหรับ fallback
 */
export async function actionSaveGalleryDescriptionHtml(
  galleryId: string,
  descriptionHtml: string,
  descriptionPlain: string
): Promise<ActionResult<Gallery>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const gallery = await updateGallery(galleryId, {
    description: descriptionPlain,
    description_html: descriptionHtml,
  }, auth.userId)

  if (!gallery) return { ok: false, error: "ไม่พบ gallery หรืออัปเดตล้มเหลว" }

  revalidatePath("/")
  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin/galleries")
  return { ok: true, data: gallery }
}

// ─── Backward-compat aliases ───────────────────────────────────────────────

export const adminBanUser = actionBanUser
export const adminUnbanUser = actionUnbanUser
export const adminCreateGallery = actionCreateGallery
export const adminUpdateGallery = actionUpdateGallery
export const adminDeleteGallery = actionDeleteGallery
export const adminBulkDeleteGalleries = actionBulkDeleteGalleries
export const adminAddLink = actionCreateLink
export const adminUpdateLink = actionUpdateLink
export const adminDeleteLink = actionDeleteLink
export const adminCreateTag = actionCreateTag
export const adminUpdateTag = actionUpdateTag
export const adminDeleteTag = actionDeleteTag
export const adminSetAnnouncement = actionSetBanner
export const adminSaveNote = actionSaveNote

export const adminBulkToggleGalleries = async (
  galleryIds: string[],
  targetActive: boolean
): Promise<{ ok: true; data: { updated: number } } | { ok: false; error: string }> => {
  const auth = await requireOwner()
  if (!auth.ok) return auth
  const { createClient } = await import("@supabase/supabase-js")
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { error } = await db
    .from("galleries")
    .update({ is_active: targetActive, updated_at: new Date().toISOString() })
    .in("id", galleryIds)
  if (error) return { ok: false, error: error.message }
  const { revalidatePath } = await import("next/cache")
  revalidatePath("/")
  revalidatePath("/admin/galleries")
  return { ok: true, data: { updated: galleryIds.length } }
}

export const adminForceRoleSync = async (
  userId: string
): Promise<{ ok: true; data: void } | { ok: false; error: string }> => {
  const auth = await requireOwner()
  if (!auth.ok) return auth
  const { syncRolesOnLogin } = await import("@/lib/auth")
  await syncRolesOnLogin(userId)

  logAdminAction({
    adminId: auth.userId,
    action: "force_role_sync",
    detail: `target userId: ${userId}`,
  }).catch(() => {})

  return { ok: true, data: undefined }
}

export const adminCreateBackup = async (): Promise<
  { ok: true; data: { url: string; created_at: string } } | { ok: false; error: string }
> => {
  const auth = await requireOwner()
  if (!auth.ok) return auth
  return {
    ok: true,
    data: {
      url: `https://app.supabase.com/project/_/database/backups`,
      created_at: new Date().toISOString(),
    },
  }
}

export const adminResetStats = async (
  galleryId: string
): Promise<{ ok: true; data: void } | { ok: false; error: string }> => {
  const auth = await requireOwner()
  if (!auth.ok) return auth
  const { createClient } = await import("@supabase/supabase-js")
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { error } = await db
    .from("galleries")
    .update({
      stat_views: 0,
      stat_copies: 0,
      stat_unique_openers: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", galleryId)
  if (error) return { ok: false, error: error.message }
  const { revalidatePath } = await import("next/cache")
  revalidatePath("/admin/galleries")
  return { ok: true, data: undefined }
}
