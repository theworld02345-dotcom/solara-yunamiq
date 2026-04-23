"use client"

import { Heart, Share2, Images, Clock, Lock, LogIn, Zap } from "lucide-react"
import type { Gallery, SessionUser } from "@/lib/types"
import { getGalleryThumbnail, getGalleryImages } from "@/lib/types"
import { canAccessGallery } from "@/lib/access"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Role tier → accent colour token
const ROLE_ACCENT: Record<string, { glow: string; badge: string; text: string }> = {
  "699Bath": { glow: "shadow-[0_0_20px_rgba(244,63,94,0.35)]",  badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",  text: "rose"   },
  "299Bath": { glow: "shadow-[0_0_20px_rgba(245,158,11,0.35)]", badge: "bg-amber-500/20 text-amber-300 border-amber-500/40", text: "amber"  },
  "199Bath": { glow: "shadow-[0_0_20px_rgba(59,130,246,0.30)]", badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",   text: "blue"   },
  "99Bath":  { glow: "shadow-[0_0_20px_rgba(139,92,246,0.30)]", badge: "bg-violet-500/20 text-violet-300 border-violet-500/40", text: "violet"},
  "69Bath":  { glow: "",                                         badge: "bg-zinc-700/60 text-zinc-300 border-zinc-600/40",   text: "zinc"   },
}

interface GalleryCardProps {
  gallery: Gallery
  session: SessionUser | null
  onOpen: (gallery: Gallery) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  blurImages?: boolean
}

export function GalleryCard({ gallery, session, onOpen, isFavorite, onToggleFavorite, blurImages = false }: GalleryCardProps) {
  const isLoggedIn = !!session
  const hasAccess = canAccessGallery(session, gallery)

  let state: "login" | "open" | "lock"
  if (!isLoggedIn) state = "login"
  else if (hasAccess) state = "open"
  else state = "lock"

  const roleName = gallery.access.min_role_name
  const accent = ROLE_ACCENT[roleName] ?? ROLE_ACCENT["69Bath"]

  // Image count badge
  const imgCount = getGalleryImages(gallery).length
  const thumbnailUrl = getGalleryThumbnail(gallery) || "/placeholder.svg"

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}/gallery/${gallery.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("คัดลอกลิงก์แล้ว")
    } catch {
      toast.error("คัดลอกลิงก์ไม่สำเร็จ")
    }
  }

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isLoggedIn) { toast.info("กรุณาเข้าสู่ระบบก่อน"); return }
    onToggleFavorite(gallery.id)
  }

  const handleOpen = () => {
    if (state === "login") {
      toast.info("กรุณาเข้าสู่ระบบก่อน", { description: "Log in first to collect your rewards!" })
      return
    }
    if (state === "lock") {
      toast.error(`ต้องมี Role ${roleName}`, {
        description: `Grab the ${roleName.replace("Bath","B")} role to unlock perks!`,
      })
      return
    }
    onOpen(gallery)
  }

  return (
    <article
      onClick={handleOpen}
      className={cn(
        // Base
        "group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer",
        "bg-zinc-900 border border-white/8",
        // Hover lift + glow
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:border-white/15",
        state === "open" && `hover:${accent.glow}`,
        // Fixed width
        "w-[220px]",
      )}
    >
      {/* ── Thumbnail ── */}
      <div className="relative w-full overflow-hidden" style={{ height: "200px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={gallery.title}
          className={cn(
            "w-full h-full object-cover object-top transition-transform duration-500",
            "group-hover:scale-[1.05]",
            state !== "open" && "brightness-50 saturate-50",
            blurImages && "blur-md scale-105",
          )}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = "/placeholder.svg"
            e.currentTarget.className = "w-full h-full object-contain opacity-10"
          }}
        />

        {/* Gradient fade bottom */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-zinc-900/90 to-transparent pointer-events-none" />

        {/* ── Pinned badge ── */}
        {gallery.is_pinned && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
            bg-amber-500/90 text-black backdrop-blur-sm">
            <Zap className="size-2.5" />PIN
          </span>
        )}

        {/* ── Image count ── */}
        {imgCount > 1 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full
            text-[10px] font-semibold bg-black/60 text-white/80 backdrop-blur-sm border border-white/10">
            <Images className="size-2.5" />{imgCount}
          </span>
        )}

        {/* ── Favorite ── */}
        <button
          type="button"
          onClick={handleFavorite}
          aria-label={isFavorite ? "ลบออกจากโปรด" : "เพิ่มโปรด"}
          className={cn(
            "absolute top-2 right-2 size-8 rounded-full flex items-center justify-center",
            "backdrop-blur-sm bg-black/50 border border-white/10",
            "transition-all hover:scale-110 active:scale-95",
          )}
        >
          <Heart className={cn("size-3.5 transition-colors", isFavorite ? "fill-rose-400 text-rose-400" : "text-white/60")} />
        </button>

        {/* ── Lock overlay ── */}
        {state !== "open" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            {state === "lock" ? (
              <Lock className="size-8 text-white/40" />
            ) : (
              <LogIn className="size-8 text-white/40" />
            )}
          </div>
        )}
      </div>

      {/* ── Meta ── */}
      <div className="flex flex-col gap-2 p-3">
        {/* Title */}
        <h3 className="font-semibold text-[13px] leading-snug text-white/90 line-clamp-2 min-h-[2.5em]">
          {gallery.title}
        </h3>

        {/* Role + time row */}
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
            accent.badge,
          )}>
            {roleName}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Clock className="size-2.5" />
            {timeAgo(gallery.uploaded_at)}
          </span>
        </div>

        {/* ── CTA row ── */}
        <div className="flex gap-1.5 mt-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleOpen() }}
            className={cn(
              "flex-1 rounded-xl py-2 text-[11px] font-bold tracking-wide transition-all active:scale-[0.97]",
              state === "open"
                ? "bg-white text-zinc-900 hover:bg-white/90"
                : state === "lock"
                ? "bg-zinc-700/80 text-zinc-400 hover:bg-zinc-700 cursor-not-allowed"
                : "bg-zinc-700/80 text-zinc-400 hover:bg-zinc-700",
            )}
          >
            {state === "open" ? "OPEN" : state === "lock" ? "LOCKED" : "LOGIN"}
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="shrink-0 size-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/8
              flex items-center justify-center transition-colors"
          >
            <Share2 className="size-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
    </article>
  )
}