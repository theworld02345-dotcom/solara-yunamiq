// Discord OAuth2 client — bot-token + identify-only strategy.
//
// Flow:
//   1. buildAuthUrl() -> redirect user to Discord with scope=identify
//   2. Discord redirects back with ?code & ?state
//   3. exchangeCode(code) -> access_token
//   4. fetchDiscordUser(access_token) -> user identity (no roles; identify scope can't read members)
//   5. fetchMemberRolesViaBotApi(user_id) -> member.roles via local bot API (fast, cached)
//      └─ fallback: fetchGuildMemberWithBot() -> direct Discord API (slow, no cache)
//   6. mapRoleIds(ids, config) -> RoleName[]

import "server-only"
import type { DiscordConfig, RoleName } from "./types"

const DISCORD_API = "https://discord.com/api/v10"
const DISCORD_CDN = "https://cdn.discordapp.com"

export interface DiscordEnv {
  clientId: string
  clientSecret: string
  botToken: string
  guildId: string
  redirectUri: string
}

export function getDiscordEnv(): DiscordEnv {
  return {
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    botToken: process.env.DISCORD_BOT_TOKEN ?? "",
    guildId: process.env.DISCORD_GUILD_ID ?? "",
    redirectUri: process.env.DISCORD_REDIRECT_URI ?? "",
  }
}

/** Throws a descriptive error if any required env var is missing. */
export function assertDiscordEnv(env: DiscordEnv): void {
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    throw new Error(`[discord] Missing env vars: ${missing.join(", ")}`)
  }
}

/** Build the Discord OAuth2 authorize URL. */
export function buildAuthUrl(env: DiscordEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "none",
  })
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`
}

export interface OAuthToken {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

/** Exchange the OAuth authorization code for an access token. */
export async function exchangeCode(env: DiscordEnv, code: string): Promise<OAuthToken> {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
  })
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`[discord] token exchange failed: ${res.status} ${text}`)
  }
  return (await res.json()) as OAuthToken
}

export interface DiscordUser {
  id: string
  username: string
  discriminator: string
  global_name: string | null
  avatar: string | null
}

/** Fetch the current user using the OAuth access token. */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`[discord] /users/@me failed: ${res.status}`)
  }
  return (await res.json()) as DiscordUser
}

export interface GuildMember {
  roles: string[]
  nick: string | null
  joined_at: string
  code?: number
}

// ---------------------------------------------------------------------------
// Bot API (local service) — fast, cached
// ---------------------------------------------------------------------------

interface BotApiMemberResponse {
  success: boolean
  userId: string
  username: string
  displayName: string
  roles: { id: string; name: string; color: string }[]
  cached: boolean
}

/**
 * Fetch member roles from the local Bot API service (index.js).
 * Much faster than calling Discord directly because the bot caches results.
 *
 * Requires env vars:
 *   BOT_API_URL          = http://localhost:4000   (URL of the running bot API)
 *   BOT_API_SECRET_KEY   = <same as config.API_SECRET_KEY in bot>
 *
 * Returns null if the bot API is unavailable — caller falls back to direct Discord call.
 */
export async function fetchMemberRolesViaBotApi(
  userId: string,
  force: boolean = false,
): Promise<{ roles: string[] } | null> {
  const botApiUrl = process.env.BOT_API_URL
  const botApiKey = process.env.BOT_API_SECRET_KEY

  if (!botApiUrl || !botApiKey) return null // not configured → caller uses fallback

  try {
    const forceParam = force ? "&force=1" : ""
    const url = `${botApiUrl}/check-role?userId=${encodeURIComponent(userId)}${forceParam}`
    const res = await fetch(url, {
      headers: { "x-api-key": botApiKey },
      cache: "no-store",
      // ถ้าบอท API ไม่ตอบใน 10 วินาทีให้ถือว่า unavailable (เพิ่มจาก 3s)
      signal: AbortSignal.timeout(20000),
    })

    if (res.status === 404) return { roles: [] } // user ไม่อยู่ใน server
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
      console.warn(`[discord] bot API error (${res.status}):`, errorData.error || "no message", "→ falling back to direct Discord")
      return null
    }

    const data = (await res.json()) as BotApiMemberResponse
    // Log role IDs for debugging
    console.log(`[discord] Bot API for ${userId}:`, data.roles.map(r => `${r.name}(${r.id})`))

    // คืน role ids (ไม่ใช่ names) เพื่อให้ mapRoleIds() ทำงานได้เหมือนเดิม
    const roleIds = data.roles.map((r) => r.id)
    return { roles: roleIds }
  } catch (err) {
    // timeout หรือ bot API ไม่ได้รัน → fallback ไปใช้ Discord โดยตรง
    console.warn("[discord] bot API unavailable:", (err as Error).message, "→ falling back to direct Discord")
    return null
  }
}

/**
 * Invalidate the bot API's cache for a specific user.
 * Call this after forcing a role sync so the next /check-role returns fresh data.
 */
export async function invalidateBotApiCache(userId: string): Promise<void> {
  const botApiUrl = process.env.BOT_API_URL
  const botApiKey = process.env.BOT_API_SECRET_KEY
  if (!botApiUrl || !botApiKey) return

  try {
    await fetch(`${botApiUrl}/cache/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "x-api-key": botApiKey },
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Direct Discord API — slow fallback (no cache, hits Discord rate limits)
// ---------------------------------------------------------------------------

/**
 * Fetch a guild member directly via BOT token.
 * Prefer fetchMemberRolesViaBotApi() — this is only used as a fallback.
 */
export async function fetchGuildMemberWithBot(
  env: DiscordEnv,
  userId: string,
): Promise<GuildMember | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${env.guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${env.botToken}` },
    cache: "no-store",
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.warn(`[discord] guild member fetch failed: ${res.status} ${text}`)
    return null
  }
  return (await res.json()) as GuildMember
}

/**
 * Unified member fetch — tries bot API first, falls back to direct Discord.
 * Use this everywhere instead of calling fetchGuildMemberWithBot directly.
 */
export async function fetchMember(
  env: DiscordEnv,
  userId: string,
  options: { force?: boolean } = {},
): Promise<GuildMember | null> {
  // 1. Try local bot API (fast, cached)
  const botResult = await fetchMemberRolesViaBotApi(userId, options.force)
  if (botResult !== null) {
    return { roles: botResult.roles, nick: null, joined_at: "" }
  }

  // 2. Fallback: direct Discord API (slow)
  return fetchGuildMemberWithBot(env, userId)
}

/** Convert raw Discord role IDs to the RoleName[] recognised by the gallery access layer. */
export function mapRoleIds(roleIds: string[], config: DiscordConfig): RoleName[] {
  const set = new Set(roleIds)
  return config.role_id.filter((r) => set.has(r.id)).map((r) => r.name)
}

/** Build the public avatar URL for a Discord user, or null if they have no avatar set. */
export function buildAvatarUrl(userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null
  const ext = avatarHash.startsWith("a_") ? "gif" : "webp"
  return `${DISCORD_CDN}/avatars/${userId}/${avatarHash}.${ext}?size=128`
}

/** Build a display tag using global_name (new Discord usernames) or fall back to legacy. */
export function buildDiscordTag(user: DiscordUser): string {
  if (user.global_name) return user.global_name
  if (user.discriminator && user.discriminator !== "0") {
    return `${user.username}#${user.discriminator}`
  }
  return user.username
}
