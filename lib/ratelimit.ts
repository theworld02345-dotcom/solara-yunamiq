import "server-only"

/**
 * Simple in-memory rate limiter.
 * Production note: replace with Redis/Upstash when you go multi-instance.
 * This implementation is safe for single-process deployments (local dev, single VPS).
 */

interface RateWindow {
  count: number
  resetAt: number
}

// One Map per named limiter so different limits don't share state
const limiters = new Map<string, Map<string, RateWindow>>()

function getLimiter(name: string): Map<string, RateWindow> {
  if (!limiters.has(name)) limiters.set(name, new Map())
  return limiters.get(name)!
}

export interface RateLimitOptions {
  /** Unique name for this limit bucket (e.g. "copy_link") */
  name: string
  /** The identifier to rate-limit against — use userId or IP */
  key: string
  /** Maximum requests allowed within the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  ok: boolean
  /** How many requests remain in the current window */
  remaining: number
  /** Unix timestamp (ms) when the window resets */
  resetAt: number
}

export function checkRateLimit({
  name,
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): RateLimitResult {
  const store = getLimiter(name)
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  const existing = store.get(key)

  // If no entry or window has expired — start fresh
  if (!existing || existing.resetAt <= now) {
    const entry: RateWindow = { count: 1, resetAt: now + windowMs }
    store.set(key, entry)
    return { ok: true, remaining: limit - 1, resetAt: entry.resetAt }
  }

  existing.count += 1
  const remaining = Math.max(0, limit - existing.count)
  return {
    ok: existing.count <= limit,
    remaining,
    resetAt: existing.resetAt,
  }
}

// Periodic cleanup so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now()
  for (const store of limiters.values()) {
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }
}, 60_000)
