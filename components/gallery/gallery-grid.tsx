"use client"

/**
 * gallery-grid.tsx
 *
 * Features:
 *  - Skeleton loading via GalleryGridSkeleton (pass isLoading={true})
 *  - TanStack Virtual row-virtualizer for 200+ gallery lists
 *  - CSS grid auto-fill fallback when list < 50 items
 *
 * Install dependency (run once):
 *   pnpm add @tanstack/react-virtual
 */

import { useRef, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Gallery, SessionUser } from "@/lib/types"
import { GalleryCard } from "./gallery-card"
import { GalleryGridSkeleton } from "./gallery-card-skeleton"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Images } from "lucide-react"

const CARD_WIDTH = 220
const GAP = 16 // gap-4 = 16px
const CARD_HEIGHT = 316 // 200px thumb + 116px meta (approx)
const ROW_HEIGHT = CARD_HEIGHT + GAP

function columnCount(containerWidth: number): number {
  if (containerWidth <= 0) return 2
  return Math.max(1, Math.floor((containerWidth + GAP) / (CARD_WIDTH + GAP)))
}

interface GalleryGridProps {
  galleries: Gallery[]
  session: SessionUser | null
  onOpen: (gallery: Gallery) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
  /** Pass true while data is being fetched */
  isLoading?: boolean
  /** How many skeleton cards to render while loading */
  skeletonCount?: number
  /** Blur all thumbnails (Safe Mode) */
  blurImages?: boolean
}

export function GalleryGrid({
  galleries,
  session,
  onOpen,
  isFavorite,
  onToggleFavorite,
  isLoading = false,
  skeletonCount = 12,
  blurImages = false,
}: GalleryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = containerRef.current?.offsetWidth ?? 0
  const cols = columnCount(containerWidth)

  const rows = useMemo<Gallery[][]>(() => {
    const result: Gallery[][] = []
    for (let i = 0; i < galleries.length; i += cols) {
      result.push(galleries.slice(i, i + cols))
    }
    return result
  }, [galleries, cols])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () =>
      typeof window !== "undefined"
        ? (document.documentElement as unknown as HTMLElement)
        : null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    // Only active when we actually virtualise (>= 50 items)
    enabled: galleries.length >= 50,
  })

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return <GalleryGridSkeleton count={skeletonCount} />
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (galleries.length === 0) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <Images className="size-10 text-zinc-600" />
          <EmptyTitle className="text-zinc-400">ไม่พบ Gallery</EmptyTitle>
          <EmptyDescription className="text-zinc-600">
            ลองปรับคำค้นหรือเปลี่ยน filter
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    )
  }

  // ── Small list (<50): plain CSS grid, zero virtualizer overhead ──────────
  if (galleries.length < 50) {
    return (
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_WIDTH}px, ${CARD_WIDTH}px))`,
        }}
      >
        {galleries.map((g) => (
          <GalleryCard
            key={g.id}
            gallery={g}
            session={session}
            onOpen={onOpen}
            isFavorite={isFavorite(g.id)}
            onToggleFavorite={onToggleFavorite}
            blurImages={blurImages}
          />
        ))}
      </div>
    )
  }

  // ── Large list (50+): TanStack Virtual ──────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((vRow) => {
        const rowGalleries = rows[vRow.index]
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start - (virtualizer.options.scrollMargin ?? 0)}px)`,
            }}
          >
            <div className="flex gap-4 pb-4">
              {rowGalleries.map((g) => (
                <GalleryCard
                  key={g.id}
                  gallery={g}
                  session={session}
                  onOpen={onOpen}
                  isFavorite={isFavorite(g.id)}
                  onToggleFavorite={onToggleFavorite}
                  blurImages={blurImages}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}