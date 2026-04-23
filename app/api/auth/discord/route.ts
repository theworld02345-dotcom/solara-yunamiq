import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { buildAuthUrl, getDiscordEnv, assertDiscordEnv } from "@/lib/discord"
import { randomBytes } from "node:crypto"

const STATE_COOKIE = "solara_oauth_state"

export async function GET(): Promise<never> {
  const env = getDiscordEnv()

  try {
    assertDiscordEnv(env)
  } catch (err) {
    console.error("[auth/discord]", err)
    redirect("/?error=config")
  }

  // Generate a cryptographically random state value for CSRF protection.
  // Stored in an httpOnly cookie and compared against the callback parameter.
  const state = randomBytes(24).toString("hex")

  const store = await cookies()
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes — enough for any OAuth round-trip
    secure: process.env.NODE_ENV === "production",
  })

  redirect(buildAuthUrl(env, state))
}
