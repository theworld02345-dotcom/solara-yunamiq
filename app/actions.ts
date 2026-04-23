"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { clearSession, getSession, setMockSession } from "@/lib/auth"
import {
  appendAudit,
  getGalleryById,
  getUserById,
  incrementGalleryView,
  incrementLinkCopy,
  mergeUserFavorites,
  recordLinkCopy,
  toggleUserFavorite,
} from "@/lib/db"
import { canAccessGallery, canCopyLink } from "@/lib/access"
import { checkRateLimit } from "@/lib/ratelimit"
import {
  logUserLogin,
  logUserLogout,
  logLinkCopy,
} from "@/lib/webhooks"

/**
 * Initiate real Discord OAuth2 login flow.
 * Redirects to /api/auth/discord which generates the state cookie and redirects to Discord.
 */
export async function loginAction(): Promise<void> {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    await setMockSession()
    const session = await getSession()
    if (session) {
      await appendAudit(session.user_id, {
        action: "login",
        timestamp: new Date().toISOString(),
      })
      // Webhook log
      logUserLogin({
        userId: session.user_id,
        discordTag: session.discord_tag,
        avatar: session.avatar,
        roles: session.active_roles,
      }).catch(() => {})
    }
    revalidatePath("/")
    return
  }

  redirect("/api/auth/discord")
}

/**
 * @deprecated Use loginAction() instead.
 */
export async function loginMock(): Promise<void> {
  return loginAction()
}

export async function logoutAction(): Promise<void> {
  const session = await getSession()
  if (session) {
    await appendAudit(session.user_id, {
      action: "logout",
      timestamp: new Date().toISOString(),
    })
    // Webhook log
    logUserLogout({
      userId: session.user_id,
      discordTag: session.discord_tag,
    }).catch(() => {})
  }
  await clearSession()
  revalidatePath("/")
}

export async function openGalleryAction(galleryId: string): Promise<void> {
  const session = await getSession()
  if (!session) return

  const rl = checkRateLimit({ name: "open_gallery", key: session.user_id, limit: 60, windowSeconds: 60 })
  if (!rl.ok) return

  const gallery = await getGalleryById(galleryId)
  if (!gallery || !canAccessGallery(session, gallery)) return
  await incrementGalleryView(galleryId)
  await appendAudit(session.user_id, {
    action: "open_gallery",
    gallery_id: galleryId,
    timestamp: new Date().toISOString(),
  })
}

export type CopyLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: string }

export async function copyLinkAction(galleryId: string, linkId: string): Promise<CopyLinkResult> {
  const session = await getSession()
  if (!session) return { ok: false, reason: "not_logged_in" }

  const rl = checkRateLimit({ name: "copy_link", key: session.user_id, limit: 10, windowSeconds: 60 })
  if (!rl.ok) return { ok: false, reason: "rate_limited" }

  const gallery = await getGalleryById(galleryId)
  if (!gallery) return { ok: false, reason: "gallery_not_found" }
  if (!canAccessGallery(session, gallery)) return { ok: false, reason: "role_too_low" }

  const link = gallery.links.find((l) => l.id === linkId)
  if (!link) return { ok: false, reason: "link_not_found" }

  const user = await getUserById(session.user_id)
  const currentCopies = user?.link_usage?.[galleryId]?.[linkId]?.copy_count ?? 0
  const check = canCopyLink(session, link, currentCopies)
  if (!check.ok) return { ok: false, reason: check.reason }

  await recordLinkCopy(session.user_id, galleryId, linkId)
  await incrementLinkCopy(galleryId, linkId)

  // ─── Admin Webhook: log copy event ───────────────────────────────────
  logLinkCopy({
    userId: session.user_id,
    discordTag: session.discord_tag,
    galleryId,
    galleryTitle: gallery.title,
    linkId,
    linkLabel: link.label,
    copyCount: currentCopies + 1,
  }).catch(() => {})

  return { ok: true, url: link.url }
}

/**
 * Toggle a gallery in the logged-in user's favorites.
 */
export async function toggleFavoriteAction(galleryId: string): Promise<string[]> {
  const session = await getSession()
  if (!session) return []
  const gallery = await getGalleryById(galleryId)
  if (!gallery) return session.favorites
  const next = await toggleUserFavorite(session.user_id, galleryId)
  await appendAudit(session.user_id, {
    action: next.includes(galleryId) ? "favorite_add" : "favorite_remove",
    gallery_id: galleryId,
    timestamp: new Date().toISOString(),
  })
  return next
}

/**
 * Merge guest (localStorage) favorites into the logged-in user's favorites.
 */
export async function mergeFavoritesAction(ids: string[]): Promise<string[]> {
  const session = await getSession()
  if (!session) return []
  if (!ids || ids.length === 0) return session.favorites
  return mergeUserFavorites(session.user_id, ids)
}
