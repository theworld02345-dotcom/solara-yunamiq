import { type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  assertDiscordEnv,
  buildAvatarUrl,
  buildDiscordTag,
  exchangeCode,
  fetchDiscordUser,
  fetchMember,
  getDiscordEnv,
  mapRoleIds,
} from "@/lib/discord"
import { getDiscordConfig, upsertDiscordUser, appendAudit } from "@/lib/db"
import { setSession } from "@/lib/auth"
import { logUserLogin } from "@/lib/webhooks"

const STATE_COOKIE = "solara_oauth_state"

export async function GET(req: NextRequest): Promise<never> {
  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const stateReturned = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.warn("[auth/callback] Discord returned error:", error)
    redirect("/?error=discord_denied")
  }

  if (!code || !stateReturned) {
    redirect("/?error=invalid_callback")
  }

  // CSRF check
  const store = await cookies()
  const stateStored = store.get(STATE_COOKIE)?.value
  store.delete(STATE_COOKIE)

  if (!stateStored || stateStored !== stateReturned) {
    console.warn("[auth/callback] State mismatch — possible CSRF attack")
    redirect("/?error=state_mismatch")
  }

  const env = getDiscordEnv()
  try {
    assertDiscordEnv(env)
  } catch (err) {
    console.error("[auth/callback] env error:", err)
    redirect("/?error=config")
  }

  try {
    const token = await exchangeCode(env, code)
    const discordUser = await fetchDiscordUser(token.access_token)

    const member = await fetchMember(env, discordUser.id)
    const discordConfig = getDiscordConfig()
    const activeRoles = member ? mapRoleIds(member.roles, discordConfig) : []

    console.log("[auth/callback] roles synced for", discordUser.id, "->", activeRoles)

    const { user, rolesBefore } = await upsertDiscordUser({
      user_id: discordUser.id,
      username: discordUser.username,
      discord_tag: buildDiscordTag(discordUser),
      avatar: buildAvatarUrl(discordUser.id, discordUser.avatar),
      active_roles: activeRoles,
    })

    await appendAudit(user.user_id, {
      action: "login",
      timestamp: new Date().toISOString(),
      roles_before: rolesBefore,
      roles_after: activeRoles,
    })

    // ─── Admin Webhook: log real Discord login ─────────────────────────
    logUserLogin({
      userId: user.user_id,
      discordTag: buildDiscordTag(discordUser),
      avatar: discordUser.avatar,
      roles: activeRoles,
    }).catch(() => {}) // fire-and-forget — ไม่ให้ webhook เป็นสาเหตุ redirect fail

    await setSession(user.user_id)
  } catch (err) {
    console.error("[auth/callback] OAuth flow failed:", err)
    redirect("/?error=oauth_failed")
  }

  redirect("/")
}
