// Shared TypeScript types for the Gallery system.
// Keep these UI-safe (no server-only imports) so they can be used on both sides.

export type RoleName = "69Bath" | "99Bath" | "199Bath" | "299Bath" | "699Bath"

export interface DiscordRole {
  name: RoleName
  id: string
  hierarchy_level: number
}

export interface DiscordConfig {
  ownerid_user: string
  role_id: DiscordRole[]
}

export interface RolesCache {
  active_roles: RoleName[]
  last_synced: string
  cache_expires_at: string
}

export interface AuditEntry {
  action: string
  timestamp: string
  gallery_id?: string
  link_id?: string
  tag_id?: string       // ✅ FIX v3.2: รองรับ audit สำหรับ tag actions
  ip_hash?: string
  ua_hash?: string
  roles_before?: RoleName[]
  roles_after?: RoleName[]
}

export interface LinkUsage {
  copy_count: number
  last_copied_at: string
}

export interface AppUser {
  user_id: string
  username: string
  discord_tag: string
  avatar: string | null
  is_banned: boolean
  ban_reason: string | null
  first_login: string
  last_login: string
  login_count: number
  roles_cache: RolesCache
  link_usage: Record<string, Record<string, LinkUsage>>
  audit_log: AuditEntry[]
  favorites: string[]
}

export interface Tag {
  id: string
  name: string
  display: string
  color: string
  gallery_ids: string[]
  gallery_count: number
  created_at: string
  created_by: string
  updated_at?: string   // ✅ FIX v3.2: track การแก้ไข
  updated_by?: string   // ✅ FIX v3.2: track admin ที่แก้ไข
  is_active: boolean
}

export type NullReason = "link_dead" | "moved" | "owner_request" | null

export interface GalleryLink {
  id: string
  label: string
  url: string
  is_active: boolean
  null_reason: NullReason
  copy_limit_per_user: number
  total_copies: number
  accessible_by_min_level: number
  /** URL รูป thumbnail ของ link นี้ (ถ้ามี) — ใช้แสดงใน Discord embed + gallery UI */
  image_url: string | null
}

export interface GalleryAccess {
  min_hierarchy_level: number
  min_role_name: RoleName
  mode: "hierarchy" | "exact"
}

export interface GalleryStats {
  total_views: number
  total_copies: number
  unique_openers: number
}

// ---------------------------------------------------------------------------
// Multi-image support — ใช้ URL แทนการอัปโหลดไฟล์เพื่อหลีกเลี่ยง
// JSON bloat และ memory pressure จาก base64
// ---------------------------------------------------------------------------
export interface GalleryImage {
  /** unique id ของรูปใน gallery นี้ */
  id: string
  /** URL ของรูป เช่น https://i.imgur.com/xxx.jpg */
  url: string
  /** caption แสดงใต้รูปใน lightbox (optional) */
  caption?: string
  /** ลำดับการแสดงผล — ใช้ sort ก่อน render เสมอ */
  sort_order: number
  /** เวลาที่เพิ่มรูปนี้ */
  added_at: string
}

export interface Gallery {
  id: string
  title: string
  description: string
  /** Rich text description in HTML format (supports images, formatting, etc.) */
  description_html: string | null
  /**
   * @deprecated ใช้ images[0].url แทน
   * เก็บไว้เพื่อ backward-compat กับ gallery เก่าที่ยังไม่ migrate
   */
  thumbnail: string
  /** รายการรูปทั้งหมดของ gallery นี้ (URL-based, เรียงตาม sort_order) */
  images: GalleryImage[]
  tags: string[]
  uploaded_by: string
  uploaded_at: string
  updated_at: string
  is_active: boolean
  is_pinned: boolean
  access: GalleryAccess
  stats: GalleryStats
  links: GalleryLink[]
}

// Session carried to the client. Never include audit_log or sensitive data here.
export interface SessionUser {
  user_id: string
  username: string
  discord_tag: string
  avatar: string | null
  active_roles: RoleName[]
  max_hierarchy_level: number
  is_owner: boolean
  favorites: string[]
  /** ยศที่มาจาก Digital-RoleID Override (ใช้แสดง badge พิเศษใน UI) */
  digital_roles: RoleName[]
}

// Announcement banner shown to all users
export interface AnnouncementBanner {
  message: string
  type: "info" | "warning" | "success"
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers — ดึง thumbnail จาก gallery ไม่ว่าจะเป็น format เก่าหรือใหม่
// ---------------------------------------------------------------------------

/** ดึง URL รูปแรกของ gallery (รองรับทั้ง format เก่าและใหม่) */
export function getGalleryThumbnail(gallery: Gallery): string {
  if (gallery.images && gallery.images.length > 0) {
    const sorted = [...gallery.images].sort((a, b) => a.sort_order - b.sort_order)
    return sorted[0].url
  }
  return gallery.thumbnail ?? ""
}

/** ดึงรายการรูปเรียง sort_order (fallback ไป thumbnail ถ้าไม่มี images) */
export function getGalleryImages(gallery: Gallery): GalleryImage[] {
  if (gallery.images && gallery.images.length > 0) {
    return [...gallery.images].sort((a, b) => a.sort_order - b.sort_order)
  }
  // Backward-compat: wrap thumbnail เป็น GalleryImage
  if (gallery.thumbnail) {
    return [
      {
        id: "legacy-thumbnail",
        url: gallery.thumbnail,
        sort_order: 0,
        added_at: gallery.uploaded_at,
      },
    ]
  }
  return []
}

// ---------------------------------------------------------------------------
// ✅ NEW: Media type helpers — ใช้ใน component เพื่อตัดสินใจว่าควร
//         render ด้วย <img> (GIF) หรือ <Image> (static)
//
// WHY: next/image จะ optimize (convert) GIF → WebP ทันที
//      ทำให้ animation หายไป และขนาด payload ก็ไม่ลดจริงๆ
//      วิธีแก้: ตรวจ URL แล้วส่ง unoptimized={true} หรือใช้ <img> ธรรมดา
//
// USAGE ใน component:
//   import { isGifUrl, isVideoUrl } from "@/lib/types"
//   {isGifUrl(img.url)
//     ? <img src={img.url} alt={img.caption ?? ""} className="..." />
//     : <Image src={img.url} unoptimized={false} ... />
//   }
// ---------------------------------------------------------------------------

/**
 * ตรวจว่า URL เป็น GIF หรือเปล่า
 * รองรับทั้ง extension (.gif) และ query string (?format=gif)
 */
export function isGifUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    // extension-based
    if (parsed.pathname.toLowerCase().endsWith(".gif")) return true
    // query param (เช่น Discord CDN บางครั้ง)
    if (parsed.searchParams.get("format") === "gif") return true
    return false
  } catch {
    // fallback สำหรับ relative URL หรือ URL ที่ parse ไม่ได้
    return url.toLowerCase().includes(".gif")
  }
}

/**
 * ตรวจว่า URL เป็น video หรือเปล่า (mp4, webm, mov)
 * ใช้สำหรับ render <video> แทน <img>
 */
export function isVideoUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    lower.includes(".mp4") ||
    lower.includes(".webm") ||
    lower.includes(".mov") ||
    lower.includes(".m4v")
  )
}

/**
 * ตรวจว่า URL เป็น static image (jpg, png, webp, avif)
 * ถ้า true → ใช้ next/image ได้ปลอดภัย
 */
export function isStaticImageUrl(url: string): boolean {
  if (!url) return false
  if (isGifUrl(url) || isVideoUrl(url)) return false
  return true
}

// ---------------------------------------------------------------------------
// Digital-RoleID Override
// ระบบให้ยศชั่วคราวก่อนที่ระบบจะ sync ยศจริงจาก Discord
//
// Logic:
//   1. Admin สร้าง DigitalRoleOverride สำหรับ user คนใดก็ได้
//   2. กำหนด role ที่จะให้ + เวลาหมดอายุ
//   3. ทุกครั้งที่ getSession() ถูกเรียก → ระบบตรวจ active overrides ของ user นั้น
//   4. ถ้า override ยังไม่หมดอายุ → merge role จาก override เข้า active_roles
//   5. ถ้า Discord sync สำเร็จแล้วและ user ได้ role CONFIRMED_BY_ROLE_ID จริง
//      → override จะถูก auto-deactivate (is_superseded = true)
//   6. ถ้าเวลาหมด → override ถูก ignore โดยอัตโนมัติ (ไม่ต้องลบ)
// ---------------------------------------------------------------------------
export interface DigitalRoleOverride {
  /** UUID ของ override นี้ */
  id: string
  /** Discord user ID ที่ได้รับ override */
  user_id: string
  /** ยศที่จะให้ชั่วคราว */
  role_name: RoleName
  /** hierarchy level ของยศนั้น (denormalized เพื่อความเร็ว) */
  role_level: number
  /** เวลาที่ override หมดอายุ (ISO string) */
  expires_at: string
  /** เวลาที่สร้าง */
  created_at: string
  /** Admin ที่สร้าง override นี้ */
  created_by: string
  /** หมายเหตุ admin (optional) */
  note: string | null
  /**
   * true = ระบบ Discord sync เสร็จแล้ว user ได้ยศจริงแล้ว
   * override นี้ถูก supersede ไปแล้ว → ไม่ต้อง merge อีก
   */
  is_superseded: boolean
  /** เวลาที่ถูก supersede (null ถ้ายังไม่ถูก) */
  superseded_at: string | null
  /**
   * Discord Role ID ที่ใช้เป็นเกณฑ์ตรวจว่า "sync เสร็จแล้ว"
   * ถ้า user ได้ role ID นี้จาก Discord จริงๆ → override จะถูก supersede อัตโนมัติ
   * null = ใช้ role_name เพื่อหา ID จาก DiscordConfig อัตโนมัติ
   */
  confirmed_by_role_id: string | null
}
