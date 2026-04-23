"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SessionUser } from "@/lib/types"
import { mergeFavoritesAction, toggleFavoriteAction } from "@/app/actions"

const STORAGE_KEY = "solara.favorites"

/**
 * Unified favorites hook.
 *
 * - Guest (no session): backed by localStorage, synchronous toggles.
 * - Logged-in: backed by server (users.json), optimistic toggles reconciled with
 *   the server's response.
 * - On first mount while logged-in, any local guest favorites are merged into
 *   the server list (one-way) and the local store is cleared.
 */
export function useFavorites(session: SessionUser | null) {
  const isLoggedIn = !!session
  const [favorites, setFavorites] = useState<string[]>(session?.favorites ?? [])
  const mergedRef = useRef(false)

  // Hydrate guest favorites from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return

    if (!isLoggedIn) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) setFavorites(parsed.filter((x): x is string => typeof x === "string"))
        }
      } catch {
        /* ignore malformed storage */
      }
      return
    }

    // Logged-in: merge any guest favorites into the server, then clear local.
    if (mergedRef.current) return
    mergedRef.current = true
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const local = JSON.parse(raw)
      if (!Array.isArray(local) || local.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY)
        return
      }
      mergeFavoritesAction(local.filter((x): x is string => typeof x === "string"))
        .then((serverList) => {
          setFavorites(serverList)
          window.localStorage.removeItem(STORAGE_KEY)
        })
        .catch(() => {
          /* keep local as fallback */
        })
    } catch {
      /* ignore */
    }
  }, [isLoggedIn])

  // Persist guest favorites to localStorage whenever they change.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isLoggedIn) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
    } catch {
      /* storage full / blocked — no-op */
    }
  }, [favorites, isLoggedIn])

  const isFav = useCallback((id: string) => favorites.includes(id), [favorites])

  const toggle = useCallback(
    (id: string) => {
      // Optimistic update for both branches.
      setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

      if (isLoggedIn) {
        toggleFavoriteAction(id)
          .then((serverList) => {
            setFavorites(serverList)
          })
          .catch(() => {
            // Revert on failure.
            setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          })
      }
    },
    [isLoggedIn],
  )

  return { favorites, isFav, toggle }
}
