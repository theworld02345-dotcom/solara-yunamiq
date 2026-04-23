// Role-hierarchy access helpers. Pure functions so they can run on both sides.

import type { DiscordConfig, Gallery, GalleryLink, RoleName, SessionUser } from "./types"

export function roleLevel(discord: DiscordConfig, roleName: RoleName | string): number {
  return discord.role_id.find((r) => r.name === roleName)?.hierarchy_level ?? 0
}

export function maxUserLevel(discord: DiscordConfig, roles: RoleName[] | string[]): number {
  if (!roles || roles.length === 0) return 0
  return Math.max(...roles.map((r) => roleLevel(discord, r)))
}

export function canAccessGallery(session: SessionUser | null, gallery: Gallery): boolean {
  if (!session) return false
  return session.max_hierarchy_level >= gallery.access.min_hierarchy_level
}

export function canCopyLink(
  session: SessionUser | null,
  link: GalleryLink,
  currentCopyCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (!session) return { ok: false, reason: "not_logged_in" }
  if (!link.is_active) return { ok: false, reason: link.null_reason ?? "inactive" }
  if (session.max_hierarchy_level < link.accessible_by_min_level) return { ok: false, reason: "role_too_low" }
  if (currentCopyCount >= link.copy_limit_per_user) return { ok: false, reason: "copy_limit_reached" }
  return { ok: true }
}
