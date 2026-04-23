// Auth layer — supports both real Discord OAuth2 and dev mock session.
// v2: เพิ่ม Digital-RoleID Override merge ใน getSession()

import "server-only"
import { cookies } from "next/headers"
import {
  fetchMember,
  getDiscordEnv,
  mapRoleIds,
  invalidateBotApiCache,
} from "./discord"
import {
  getDiscordConfig,
  getUserById,
  saveUser,
  getActiveOverridesForUser,
} from "./db"
import { maxUserLevel, roleLevel } from "./access"
import type { SessionUser, RoleName } from "./types"

export const SESSION_COOKIE = "solara_session"

/** Read the current session user, or null when logged out. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const userId = store.get(SESSION_COOKIE)?.value
  if (!userId) return null

  const [user, discord] = await Promise.all([
    getUserById(userId),
    Promise.resolve(getDiscordConfig()),
  ])
  if (!user || user.is_banned) return null

  // Role-cache background refresh when expired (non-blocking)
  const cacheExpired = new Date(user.roles_cache.cache_expires_at) < new Date()
  if (cacheExpired) {
    refreshRoleCache(userId).catch((err) => {
      console.warn("[auth] background role refresh failed:", err)
    })
  }

  // ─── Digital-RoleID: merge overrides ───────────────────────────────────
  // ดึง active overrides ของ user นี้ (query เดียว, fast)
  const activeOverrides = await getActiveOverridesForUser(userId)

  // เก็บ role names จาก override แยกไว้ให้ UI แสดง badge พิเศษ
  const digitalRoleNames: RoleName[] = activeOverrides.map((ov) => ov.role_name)

  // merge: รวม role จาก cache + override (dedup โดยใช้ Set)
  const mergedRoles: RoleName[] = Array.from(
    new Set([...user.roles_cache.active_roles, ...digitalRoleNames])
  )

  // หา max level จาก merged roles (รวม override แล้ว)
  const mergedMaxLevel = Math.max(
    maxUserLevel(discord, user.roles_cache.active_roles),
    ...activeOverrides.map((ov) => ov.role_level),
  )
  // ─── end Digital-RoleID ─────────────────────────────────────────────────

  return {
    user_id: user.user_id,
    username: user.username,
    discord_tag: user.discord_tag,
    avatar: user.avatar,
    active_roles: mergedRoles,
    max_hierarchy_level: mergedMaxLevel,
    is_owner: user.user_id === discord.ownerid_user,
    favorites: user.favorites ?? [],
    digital_roles: digitalRoleNames,
  }
}

/** Write the session cookie for the given userId. */
export async function setSession(userId: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  })
}

/**
 * Force-sync roles for a user — invalidates bot API cache first,
 * then re-fetches fresh roles and saves to user record.
 * Used by admin "Force Sync" button.
 */
export async function syncRolesOnLogin(userId: string): Promise<void> {
  try {
    await refreshRoleCache(userId, true)
  } catch (err) {
    console.warn("[auth] syncRolesOnLogin failed (non-fatal):", err)
  }
}

export async function setMockSession(): Promise<void> {
  const envId = process.env.MOCK_USER_ID
  if (envId) { await setSession(envId); return }
  const discord = getDiscordConfig()
  if (discord.ownerid_user) { await setSession(discord.ownerid_user); return }
  await setSession("885473979098337310")
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

export async function refreshRoleCache(userId: string, force: boolean = false): Promise<void> {
  const env = getDiscordEnv()
  const [user, discordConfig] = await Promise.all([getUserById(userId), Promise.resolve(getDiscordConfig())])
  if (!user) return

  const member = await fetchMember(env, userId, { force })
  const activeRoles = member ? mapRoleIds(member.roles, discordConfig) : []

  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  user.roles_cache = { active_roles: activeRoles, last_synced: now, cache_expires_at: expires }
  await saveUser(user)
  console.log("[auth] refreshRoleCache:", userId, "->", activeRoles)
}