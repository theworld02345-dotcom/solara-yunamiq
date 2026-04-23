// lib/webhooks.ts — Discord Webhook Logger
// วางทับไฟล์เดิมได้เลย
//
// ENV ที่ต้องเพิ่ม:
//   ADMIN_WEBHOOK=https://discord.com/api/webhooks/...
//   PRODUCT_WEBHOOK=https://discord.com/api/webhooks/...
//   NEXT_PUBLIC_APP_URL=https://yourdomain.com
//
// ✅ v1.4 — fix: NEXT_PUBLIC_APP_URL ไม่ตั้งใน Vercel → proxy URL ชี้ localhost → Discord fail
//           → auto-detect base ด้วย fallback chain:
//             NEXT_PUBLIC_APP_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > localhost
//           → ถ้า base เป็น localhost → ไม่ wrap proxy (ใช้ URL ตรง ดีกว่า 404)
//           → log URL เสมอ (ไม่ต้องรอ WEBHOOK_DEBUG=1) เพื่อ diagnose prod
// ✅ v1.3 — image proxy ผ่าน /api/img-proxy bypass hotlink
// ✅ v1.2 — resolveAbsoluteUrl() สำหรับ relative path
// ✅ v1.1 — notifyGalleryUpdated

import "server-only"

const ADMIN_WEBHOOK   = process.env.ADMIN_WEBHOOK   ?? ""
const PRODUCT_WEBHOOK = process.env.PRODUCT_WEBHOOK ?? ""

/**
 * ✅ v1.4: Resolve base URL ด้วย fallback chain
 *   Vercel inject env อัตโนมัติ: VERCEL_PROJECT_PRODUCTION_URL (prod), VERCEL_URL (deploy ปัจจุบัน)
 *   env เหล่านี้ไม่มี protocol → ต้อง prepend https://
 */
function resolveAppBase(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, "")

  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prodHost) return `https://${prodHost.replace(/\/$/, "")}`

  const previewHost = process.env.VERCEL_URL
  if (previewHost) return `https://${previewHost.replace(/\/$/, "")}`

  return "http://localhost:3000"
}

const APP_URL  = resolveAppBase()
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(APP_URL)
const DEBUG    = process.env.WEBHOOK_DEBUG === "1"

// log config ครั้งเดียวตอน module load — ช่วยดูใน Vercel Functions logs
console.log(`[webhook] init APP_URL=${APP_URL} LOCAL=${IS_LOCAL} ADMIN=${!!ADMIN_WEBHOOK} PRODUCT=${!!PRODUCT_WEBHOOK}`)

// ─── URL resolver ───────────────────────────────────────────────────────────
/**
 * ✅ v1.4: resolve URL สำหรับ Discord embed
 *
 *  Behavior:
 *   - "/xxx.jpg"                 → "https://app.com/xxx.jpg" (same-origin)
 *   - "https://app.com/xxx"      → คงเดิม
 *   - "https://i.postimg.cc/..." → "https://app.com/api/img-proxy?url=..." (bypass hotlink)
 *   - localhost base             → ไม่ wrap proxy (Discord fetch ไม่ถึง dev machine)
 *                                  เพราะรูปบางเจ้า (supabase, vercel blob) ไม่บล็อก Discord อยู่แล้ว
 *                                  ยอมใช้ URL ตรงดีกว่า return proxy ที่ Discord fetch ไม่ได้
 *   - ""  / null / invalid       → null
 */
function resolveAbsoluteUrl(u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.trim()
  if (!s) return null
  const base = APP_URL.replace(/\/$/, "")

  // relative path → prepend base (dev: localhost — Discord fetch ไม่ถึง แต่ก็ยังใส่ให้ format ถูก)
  if (s.startsWith("/")) return `${base}${s}`

  // absolute URL → validate + ห่อ proxy ถ้าเป็น external (และ base ไม่ใช่ localhost)
  if (/^https?:\/\//i.test(s)) {
    let parsed: URL
    try { parsed = new URL(s) } catch { return null }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null

    // same-origin → ไม่ต้อง proxy
    let appHost = ""
    try { appHost = new URL(base).host } catch {}
    if (appHost && parsed.host === appHost) return s

    // ✅ v1.4: localhost base → proxy URL จะ fetch ไม่ได้ → ใช้ URL ตรงแทน
    if (IS_LOCAL) return s

    // external + prod base → ห่อ proxy bypass hotlink
    return `${base}/api/img-proxy?url=${encodeURIComponent(s)}`
  }

  return null
}

// ─── Role color map ────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, number> = {
  "69Bath":  0x71717a,
  "99Bath":  0x7c3aed,
  "199Bath": 0x2563eb,
  "299Bath": 0xd97706,
  "699Bath": 0xe11d48,
}

// Role badge ใช้ใน embed (เรียบ ไม่มี emoji เกินจำเป็น)
const ROLE_BADGE: Record<string, string> = {
  "69Bath":  "69 Bath",
  "99Bath":  "99 Bath",
  "199Bath": "199 Bath",
  "299Bath": "299 Bath",
  "699Bath": "699 Bath",
}

const LOG_COLORS = {
  login:    0x22c55e,
  logout:   0xf59e0b,
  copy:     0x3b82f6,
  ban:      0xef4444,
  unban:    0x84cc16,
  admin:    0x8b5cf6,
  product:  0x06b6d4,
  link_new: 0x10b981,
  update:   0xa855f7,   // สีม่วง สำหรับ gallery update
  error:    0xf87171,
}

type HexColor = keyof typeof LOG_COLORS

// ─── Core types ─────────────────────────────────────────────────────────────

interface DiscordEmbed {
  title?:       string
  description?: string
  color?:       number
  url?:         string
  thumbnail?:   { url: string }
  image?:       { url: string }
  fields?:      { name: string; value: string; inline?: boolean }[]
  footer?:      { text: string }
  timestamp?:   string
}

interface WebhookPayload {
  content?:    string   // ← @everyone หรือ mention อื่นๆ
  embeds?:     DiscordEmbed[]
  username?:   string
  avatar_url?: string
}

// ─── Core send ──────────────────────────────────────────────────────────────

async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  if (!url) {
    console.warn("[webhook] skipped: URL not configured")
    return
  }

  // ✅ v1.3: ?wait=true ให้ Discord validate + return 400 ถ้า embed เสีย
  //          (default = ยิง fire-and-forget → ไม่รู้ว่า URL รูปเสียจริงมั้ย)
  const sep = url.includes("?") ? "&" : "?"
  const finalUrl = `${url}${sep}wait=true`

  // ✅ v1.4: log URL เสมอ — diagnose ได้จาก Vercel logs ทันทีไม่ต้องตั้ง flag
  if (payload.embeds?.length) {
    for (const [i, e] of payload.embeds.entries()) {
      console.log(`[webhook] embed[${i}] thumb=${e.thumbnail?.url ?? "-"} image=${e.image?.url ?? "-"}`)
    }
  }

  try {
    const res = await fetch(finalUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => "")
      console.warn(`[webhook] ${res.status} ${res.statusText}: ${t.slice(0, 500)}`)
    } else if (DEBUG) {
      console.log(`[webhook] sent OK (${res.status})`)
    }
  } catch (err) {
    console.warn("[webhook] send error:", (err as Error).message)
  }
}

/** ส่งไปที่ Admin Webhook (ไม่มี @everyone) */
async function sendAdmin(embeds: DiscordEmbed[]): Promise<void> {
  await sendWebhook(ADMIN_WEBHOOK, { embeds })
}

/**
 * ส่งไปที่ Product Webhook พร้อม @everyone
 * content: "@everyone" จะส่งเป็น plain text mention ก่อน embed เสมอ
 */
async function sendProduct(embeds: DiscordEmbed[]): Promise<void> {
  await sendWebhook(PRODUCT_WEBHOOK, {
    content: "@everyone",
    embeds,
  })
}

function ts(): string {
  return new Date().toISOString()
}

// ─── ADMIN WEBHOOK EVENTS ───────────────────────────────────────────────────

/** Login */
export async function logUserLogin(opts: {
  userId:     string
  discordTag: string
  avatar:     string | null
  roles:      string[]
  ip?:        string
}): Promise<void> {
  const roleText = opts.roles.length ? opts.roles.join(", ") : "ไม่มียศ"
  const avatarUrl = opts.avatar
    ? `https://cdn.discordapp.com/avatars/${opts.userId}/${opts.avatar}.webp?size=64`
    : null

  const embed: DiscordEmbed = {
    title:     "🟢 User Login",
    color:     LOG_COLORS.login,
    thumbnail: avatarUrl ? { url: avatarUrl } : undefined,
    fields: [
      { name: "User",  value: `\`${opts.discordTag}\``, inline: true },
      { name: "ID",    value: `\`${opts.userId}\``,     inline: true },
      { name: "ยศ",    value: roleText,                  inline: false },
    ],
    footer:    { text: opts.ip ? `IP: ${opts.ip}` : "Solara Gallery" },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

/** Logout */
export async function logUserLogout(opts: {
  userId:     string
  discordTag: string
}): Promise<void> {
  const embed: DiscordEmbed = {
    title:  "🔴 User Logout",
    color:  LOG_COLORS.logout,
    fields: [
      { name: "User", value: `\`${opts.discordTag}\``, inline: true },
      { name: "ID",   value: `\`${opts.userId}\``,     inline: true },
    ],
    footer:    { text: "Solara Gallery" },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

/** Copy Link */
export async function logLinkCopy(opts: {
  userId:       string
  discordTag:   string
  galleryId:    string
  galleryTitle: string
  linkId:       string
  linkLabel:    string
  copyCount:    number
}): Promise<void> {
  const embed: DiscordEmbed = {
    title:  "📋 Link Copied",
    color:  LOG_COLORS.copy,
    fields: [
      { name: "User",    value: `\`${opts.discordTag}\``,    inline: true },
      { name: "ID",      value: `\`${opts.userId}\``,        inline: true },
      { name: "Gallery", value: `\`${opts.galleryTitle}\``,  inline: true },
      { name: "Link",    value: `\`${opts.linkLabel}\``,     inline: true },
      { name: "Copy #",  value: `${opts.copyCount}`,         inline: true },
    ],
    footer:    { text: `gallery: ${opts.galleryId} | link: ${opts.linkId}` },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

/** Ban */
export async function logUserBan(opts: {
  adminId:   string
  targetId:  string
  targetTag: string
  reason:    string
}): Promise<void> {
  const embed: DiscordEmbed = {
    title:  "🔨 User Banned",
    color:  LOG_COLORS.ban,
    fields: [
      { name: "Target",    value: `\`${opts.targetTag}\``, inline: true },
      { name: "Target ID", value: `\`${opts.targetId}\``,  inline: true },
      { name: "Admin ID",  value: `\`${opts.adminId}\``,   inline: true },
      { name: "เหตุผล",    value: opts.reason || "ไม่ระบุ", inline: false },
    ],
    footer:    { text: "Solara Gallery Admin" },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

/** Unban */
export async function logUserUnban(opts: {
  adminId:   string
  targetId:  string
  targetTag: string
}): Promise<void> {
  const embed: DiscordEmbed = {
    title:  "✅ User Unbanned",
    color:  LOG_COLORS.unban,
    fields: [
      { name: "Target",    value: `\`${opts.targetTag}\``, inline: true },
      { name: "Target ID", value: `\`${opts.targetId}\``,  inline: true },
      { name: "Admin ID",  value: `\`${opts.adminId}\``,   inline: true },
    ],
    footer:    { text: "Solara Gallery Admin" },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

/** Admin Action ทั่วไป */
export async function logAdminAction(opts: {
  adminId: string
  action:  string
  detail?: string
}): Promise<void> {
  const embed: DiscordEmbed = {
    title:       `⚙️ Admin Action — ${opts.action}`,
    color:       LOG_COLORS.admin,
    description: opts.detail ?? undefined,
    fields: [
      { name: "Admin ID", value: `\`${opts.adminId}\``, inline: true },
    ],
    footer:    { text: "Solara Gallery Admin" },
    timestamp: ts(),
  }
  await sendAdmin([embed])
}

// ─── PRODUCT WEBHOOK EVENTS (พร้อม @everyone) ──────────────────────────────

/**
 * แจ้งสินค้าใหม่ — ส่ง @everyone + embed เรียบร้อย
 *
 * Embed design:
 *   • Author row: ชื่อสินค้า + role badge
 *   • Description: คำอธิบายสินค้า (ถ้ามี)
 *   • Thumbnail: รูปสินค้า
 *   • Fields 2 col: ระดับเข้าถึง | ลิ้งดูสินค้า
 *   • Footer: Solara Gallery + timestamp
 */
export async function notifyNewGallery(opts: {
  galleryId:   string
  title:       string
  description: string
  thumbnail:   string | null
  minRole:     string
  shareUrl:    string
}): Promise<void> {
  const roleColor = ROLE_COLORS[opts.minRole] ?? 0x71717a
  const roleBadge = ROLE_BADGE[opts.minRole]  ?? opts.minRole

  // ✅ v1.2: resolve thumbnail → absolute URL (Discord ไม่รองรับ relative)
  const thumbUrl = resolveAbsoluteUrl(opts.thumbnail)

  const embed: DiscordEmbed = {
    title:       `📦 ${opts.title}`,
    description: opts.description
      ? `${opts.description}\n\u200b`   // zero-width space เพื่อให้ gap หลัง description
      : undefined,
    color:     roleColor,
    url:       opts.shareUrl,
    thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
    fields: [
      {
        name:   "ระดับที่เข้าถึงได้",
        value:  `\`${roleBadge}\` ขึ้นไป`,
        inline: true,
      },
      {
        name:   "ดูสินค้า",
        value:  `[**เปิดหน้าสินค้า →**](${opts.shareUrl})`,
        inline: true,
      },
      {
        name:   "\u200b",              // separator field (invisible)
        value:  "🔗 ลิ้งสินค้าจะแจ้งเตือนแยกอีกครั้ง",
        inline: false,
      },
    ],
    footer:    { text: "Solara Gallery" },
    timestamp: ts(),
  }

  await sendProduct([embed])
}

/**
 * แจ้งลิ้งใหม่เพิ่มเข้า gallery — ส่ง @everyone + embed เรียบร้อย
 *
 * Embed design:
 *   • Title: ชื่อ gallery
 *   • Description: ชื่อลิ้งที่เพิ่ม
 *   • Thumbnail: รูปสินค้า
 *   • Fields 2 col: ลิ้งที่เพิ่ม | ระดับเข้าถึง / ลิ้งดูสินค้า (full width)
 *   • Footer: Solara Gallery + timestamp
 */
export async function notifyNewLink(opts: {
  galleryId:     string
  galleryTitle:  string
  thumbnail:     string | null
  linkLabel:     string
  minRole:       string
  shareUrl:      string
  /** รูป thumbnail ของ link (bulk) — 1 URL = 1 embed image ใหญ่ใน Discord */
  linkImageUrls?: string[]
}): Promise<void> {
  const roleColor = ROLE_COLORS[opts.minRole] ?? 0x71717a
  const roleBadge = ROLE_BADGE[opts.minRole]  ?? opts.minRole

  const baseFields = [
    {
      name:   "ลิ้งที่เพิ่ม",
      value:  `\`${opts.linkLabel}\``,
      inline: true,
    },
    {
      name:   "ระดับที่เข้าถึงได้",
      value:  `\`${roleBadge}\` ขึ้นไป`,
      inline: true,
    },
    {
      name:   "ดูสินค้า",
      value:  `[**เปิดหน้าสินค้า →**](${opts.shareUrl})`,
      inline: false,
    },
  ]

  // ✅ v1.2: resolve ทุก URL → absolute (กรอง invalid ทิ้ง)
  const thumbUrl  = resolveAbsoluteUrl(opts.thumbnail)
  const linkImages = (opts.linkImageUrls ?? [])
    .map((u) => resolveAbsoluteUrl(u))
    .filter((u): u is string => !!u)

  // ── CASE A: ไม่มี linkImageUrls → ใช้ thumbnail field อย่างเดียว (ห้าม push เข้า image field ซ้อน) ──
  if (linkImages.length === 0) {
    await sendProduct([{
      title:       `🔗 ${opts.galleryTitle}`,
      description: `มีลิ้งใหม่เพิ่มเข้ามาแล้ว`,
      color:       roleColor,
      url:         opts.shareUrl,
      thumbnail:   thumbUrl ? { url: thumbUrl } : undefined,
      fields:      baseFields,
      footer:      { text: "Solara Gallery" },
      timestamp:   ts(),
    }])
    return
  }

  // ── CASE B: มี linkImageUrls → render เป็น image (ใหญ่) 1 embed ต่อ 1 รูป ──
  // ทุก embed ต้องมี url เดียวกัน เพื่อให้ Discord grouping image gallery ได้
  const embeds: DiscordEmbed[] = linkImages.slice(0, 10).map((imgUrl, idx) => ({
    title:       idx === 0 ? `🔗 ${opts.galleryTitle}` : undefined,
    description: idx === 0 ? `มีลิ้งใหม่เพิ่มเข้ามาแล้ว` : undefined,
    color:       roleColor,
    url:         opts.shareUrl,
    thumbnail:   idx === 0 && thumbUrl ? { url: thumbUrl } : undefined,
    image:       { url: imgUrl },
    fields:      idx === 0 ? baseFields : [],
    footer:      { text: `รูปที่ ${idx + 1} / ${linkImages.length}  •  Solara Gallery` },
    timestamp:   idx === 0 ? ts() : undefined,
  }))

  await sendProduct(embeds)
}

// ─── ✅ NEW: ADMIN GALLERY UPDATE NOTIFICATION ──────────────────────────────

/**
 * แจ้ง Admin channel เมื่อ gallery ถูกแก้ไข
 *
 * Embed design (Admin channel เท่านั้น — ไม่มี @everyone):
 *   • Title: ✏️ ชื่อสินค้า
 *   • Thumbnail: รูปสินค้า
 *   • Fields:
 *     - Admin ID | ระดับเข้าถึง (inline)
 *     - Tags (full width)
 *     - 🔗 Links — codeblock แสดงลิ้งทั้งหมด + สถานะ (copy ได้)
 *     - ลิ้งดูสินค้า (full width)
 *   • Footer: Solara Gallery Admin + timestamp
 *
 * หมายเหตุ: codeblock ใน Discord รองรับการ highlight และกด copy ได้ทันที
 */
export async function notifyGalleryUpdated(opts: {
  galleryId:   string
  title:       string
  description: string
  thumbnail:   string | null
  minRole:     string
  shareUrl:    string
  links: Array<{
    label:     string
    url:       string | null
    is_active: boolean
  }>
  tags:        string[]
  changedBy:   string
}): Promise<void> {
  const roleBadge = ROLE_BADGE[opts.minRole] ?? opts.minRole

  // ── สร้าง link codeblock ──────────────────────────────────────────────
  // รูปแบบ: สถานะ | label | url (กด copy ได้ใน Discord)
  const linkLines = opts.links.length > 0
    ? opts.links.map((l, i) => {
        const status = l.is_active ? "✅" : "❌"
        const urlPart = l.url ? l.url : "(null link)"
        return `${i + 1}. ${status} ${l.label}\n   ${urlPart}`
      }).join("\n")
    : "ยังไม่มีลิ้งในสินค้านี้"

  // Discord field value limit = 1024 chars — truncate ถ้าเกิน
  const codeblock = `\`\`\`\n${linkLines.slice(0, 950)}\n\`\`\``

  // ── สร้าง tags display ────────────────────────────────────────────────
  const tagsDisplay = opts.tags.length > 0
    ? opts.tags.map((t) => `\`${t}\``).join("  ")
    : "`ไม่มี tag`"

  // ✅ v1.2: resolve thumbnail → absolute URL
  const thumbUrl = resolveAbsoluteUrl(opts.thumbnail)

  const embed: DiscordEmbed = {
    title:     `✏️ แก้ไขสินค้า — ${opts.title}`,
    color:     LOG_COLORS.update,
    url:       opts.shareUrl,
    thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
    fields: [
      {
        name:   "Admin ID",
        value:  `\`${opts.changedBy}\``,
        inline: true,
      },
      {
        name:   "ระดับเข้าถึง",
        value:  `\`${roleBadge}\` ขึ้นไป`,
        inline: true,
      },
      {
        name:   "Tags",
        value:  tagsDisplay,
        inline: false,
      },
      {
        name:   `🔗 Links ทั้งหมด (${opts.links.length} รายการ)`,
        value:  codeblock,
        inline: false,
      },
      {
        name:   "ดูสินค้า",
        value:  `[**เปิดหน้าสินค้า →**](${opts.shareUrl})`,
        inline: false,
      },
    ],
    footer:    { text: `Solara Gallery Admin  •  id: ${opts.galleryId}` },
    timestamp: ts(),
  }

  await sendAdmin([embed])
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export function buildGalleryShareUrl(galleryId: string): string {
  return `${APP_URL}/?g=${galleryId}`
}
