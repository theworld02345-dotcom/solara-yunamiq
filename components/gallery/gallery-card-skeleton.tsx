// components/gallery/gallery-card-skeleton.tsx
// ใช้คู่กับ GalleryGrid ตอน loading

export function GalleryCardSkeleton() {
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden bg-zinc-900 border border-white/8 w-[220px]"
      aria-hidden="true"
    >
      {/* Thumbnail placeholder */}
      <div className="w-full bg-zinc-800 animate-pulse" style={{ height: "200px" }}>
        {/* shimmer overlay */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      </div>

      {/* Meta placeholder */}
      <div className="flex flex-col gap-2 p-3">
        {/* Title */}
        <div className="h-3.5 w-3/4 rounded-md bg-zinc-800 animate-pulse" />
        <div className="h-3 w-1/2 rounded-md bg-zinc-800/60 animate-pulse" />

        {/* Role + time row */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="h-4 w-16 rounded-full bg-zinc-800 animate-pulse" />
          <div className="h-3 w-12 rounded-md bg-zinc-800/60 animate-pulse" />
        </div>

        {/* CTA row */}
        <div className="flex gap-1.5 mt-1">
          <div className="flex-1 h-8 rounded-xl bg-zinc-800 animate-pulse" />
          <div className="size-8 rounded-xl bg-zinc-800 animate-pulse shrink-0" />
        </div>
      </div>
    </div>
  )
}

// Render N skeleton cards
export function GalleryGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 220px))" }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <GalleryCardSkeleton key={i} />
      ))}
    </div>
  )
}