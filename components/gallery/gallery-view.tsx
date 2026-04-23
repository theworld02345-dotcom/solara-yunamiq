"use client"

import { useMemo, useState, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import type { DiscordConfig, Gallery, SessionUser, Tag } from "@/lib/types"
import type { AnnouncementNote } from "@/lib/db"
import { TopBar, type NavView } from "./top-bar"
import { SearchFilter, type Filters } from "./search-filter"
import { GalleryGrid } from "./gallery-grid"
import { GalleryDetailModal } from "./gallery-detail-modal"
import { ProfileModal } from "./profile-modal"
import { NoteView } from "./note-view"
import { useFavorites } from "@/hooks/use-favorites"

interface GalleryViewProps {
  session: SessionUser | null
  galleries: Gallery[]
  tags: Tag[]
  discord: DiscordConfig
  uploaderName: string
  note: AnnouncementNote | null
  isLoading?: boolean
}

const DEFAULT_FILTERS: Filters = {
  query: "",
  tags: [],
  sort: "newest",
  accessibleOnly: false,
  favoritesOnly: false,
  blurImages: false,
}

export function GalleryView({
  session,
  galleries,
  tags,
  discord,
  uploaderName,
  note,
  isLoading = false,
}: GalleryViewProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeGallery, setActiveGallery] = useState<Gallery | null>(null)
  const [activeNav, setActiveNav] = useState<NavView>("gallery")

  const { favorites, isFav, toggle } = useFavorites(session)

  // ─── Deep-link: ?g=<galleryId> เพื่อเปิด modal จาก share URL ─────────
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const gId = searchParams.get("g")
    if (!gId) return
    const found = galleries.find((g) => g.id === gId)
    if (found) {
      setActiveGallery(found)
    } else {
      // gallery ไม่พบ (inactive / ไม่มีสิทธิ์ / ลบแล้ว) — ไม่ทำอะไร modal ปล่อยว่าง
      // UI จะแสดง locked state ผ่าน GalleryDetailModal เอง
    }
    // clean URL หลังเปิด modal แล้วเพื่อไม่ให้ reload ซ้ำ
    const next = new URLSearchParams(searchParams.toString())
    next.delete("g")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, galleries, router, pathname])
  // ─────────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    const favSet = new Set(favorites)
    const tagIdByName = new Map(tags.map((t) => [t.name, t.id]))
    const selectedTagIds = filters.tags
      .map((nameOrId) => tagIdByName.get(nameOrId) ?? nameOrId)
      .filter(Boolean)

    const base = galleries.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) return false
      if (filters.accessibleOnly && session && session.max_hierarchy_level < g.access.min_hierarchy_level) return false
      if (filters.accessibleOnly && !session) return false
      if (filters.favoritesOnly && !favSet.has(g.id)) return false
      if (selectedTagIds.length > 0 && !selectedTagIds.some((id) => g.tags.includes(id))) return false
      return true
    })

    return [...base].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      const ta = new Date(a.uploaded_at).getTime()
      const tb = new Date(b.uploaded_at).getTime()
      return filters.sort === "newest" ? tb - ta : ta - tb
    })
  }, [galleries, filters, favorites, tags, session])

  const accessibleCount = session
    ? galleries.filter((g) => g.access.min_hierarchy_level <= session.max_hierarchy_level).length
    : 0

  const handleCloseModal = () => {
    setActiveGallery(null)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <TopBar
        session={session}
        onOpenProfile={() => setProfileOpen(true)}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      {activeNav === "gallery" && (
        <div className="border-b border-white/5 bg-zinc-900/50">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-2 flex items-center gap-6 text-[11px] text-zinc-500">
            {isLoading ? (
              <span className="text-zinc-600">กำลังโหลด...</span>
            ) : (
              <>
                <span>
                  <span className="text-zinc-300 font-semibold">{filtered.length}</span>
                  {filtered.length !== galleries.length && (
                    <span className="ml-1">/ {galleries.length}</span>
                  )}{" "}
                  gallery
                </span>
                {session && (
                  <span>
                    เข้าถึงได้{" "}
                    <span className="text-zinc-300 font-semibold">{accessibleCount}</span>
                  </span>
                )}
                {favorites.length > 0 && (
                  <span>
                    โปรด{" "}
                    <span className="text-zinc-300 font-semibold">{favorites.length}</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {activeNav === "gallery" ? (
          <>
            <SearchFilter
              filters={filters}
              onFiltersChange={setFilters}
              tags={tags}
              showFavoritesOption={true}
              showAccessibleOption={!!session}
            />
            <GalleryGrid
              galleries={filtered}
              session={session}
              onOpen={(g) => setActiveGallery(g)}
              isFavorite={isFav}
              onToggleFavorite={toggle}
              isLoading={isLoading}
              skeletonCount={12}
              blurImages={filters.blurImages}
            />
          </>
        ) : (
          <NoteView note={note} />
        )}
      </main>

      {/* ─── Modal ที่รองรับทั้ง normal open และ share link open ─────── */}
      <GalleryDetailModal
        open={!!activeGallery}
        onOpenChange={(open) => !open && handleCloseModal()}
        gallery={activeGallery}
        session={session}
        tags={tags}
        uploaderName={uploaderName}
        // ส่ง allGalleries ให้ modal ตรวจสอบ locked state สำหรับ share link ที่ไม่มีสิทธิ์
        allGalleries={galleries}
      />

      {session && (
        <ProfileModal
          open={profileOpen}
          onOpenChange={setProfileOpen}
          session={session}
          discord={discord}
        />
      )}
    </div>
  )
}
