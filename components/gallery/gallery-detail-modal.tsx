"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  X, Copy, Check, ExternalLink, ShoppingBag, Heart,
  AlertCircle, Lock, Eye, ClipboardList, Users,
  ChevronDown, ChevronUp, Zap, Crown, Share2,
  ChevronLeft, ChevronRight, Images, Maximize2, Minimize2,
  BookOpen, ArrowLeft, Download, ZoomIn, ZoomOut,
} from "lucide-react"
import { toast } from "sonner"
import type { Gallery, GalleryLink, SessionUser, Tag } from "@/lib/types"
import { getGalleryImages, isGifUrl, isVideoUrl } from "@/lib/types"
import { canAccessGallery } from "@/lib/access"
import { formatUploadDate, timeAgo } from "@/lib/format"
import { useFavorites } from "@/hooks/use-favorites"
import { copyLinkAction, openGalleryAction } from "@/app/actions"

function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-white/8 ${className}`} />
}

const ROLE_CONFIG: Record<string, { bg: string; text: string; border: string; glow: string; icon: string }> = {
  "69Bath":  { bg: "bg-zinc-800",       text: "text-zinc-300",   border: "border-zinc-600",       glow: "",                                              icon: "⚡" },
  "99Bath":  { bg: "bg-violet-950/70",  text: "text-violet-300", border: "border-violet-600/50",  glow: "shadow-[0_0_12px_rgba(139,92,246,0.3)]",        icon: "💜" },
  "199Bath": { bg: "bg-blue-950/70",    text: "text-blue-300",   border: "border-blue-500/50",    glow: "shadow-[0_0_12px_rgba(59,130,246,0.3)]",        icon: "💙" },
  "299Bath": { bg: "bg-amber-950/70",   text: "text-amber-300",  border: "border-amber-500/50",   glow: "shadow-[0_0_12px_rgba(245,158,11,0.35)]",       icon: "🥇" },
  "699Bath": { bg: "bg-rose-950/70",    text: "text-rose-300",   border: "border-rose-500/50",    glow: "shadow-[0_0_16px_rgba(244,63,94,0.4)]",         icon: "👑" },
}

function RoleBadge({ role, size = "sm" }: { role: string; size?: "sm" | "md" | "lg" }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG["69Bath"]
  const sz = size === "lg" ? "text-sm px-3 py-1 gap-1.5" : size === "md" ? "text-xs px-2.5 py-0.5 gap-1" : "text-[11px] px-2 py-0.5 gap-1"
  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.glow} ${sz}`}>
      <span>{cfg.icon}</span>{role}
    </span>
  )
}

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl bg-white/5 border border-white/8 min-w-[64px]">
      <div className="text-zinc-400">{icon}</div>
      <span className="text-sm font-bold text-white tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span className="text-[10px] text-zinc-500 leading-none">{label}</span>
    </div>
  )
}

const NULL_REASON_LABELS: Record<string, string> = {
  link_dead: "ลิงก์เสีย", moved: "ย้ายแล้ว", owner_request: "ลบโดยเจ้าของ",
}

function LinkRow({ link, galleryId, session, idx }: {
  link: GalleryLink; galleryId: string; session: SessionUser | null; idx: number
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleCopy = async () => {
    if (busy) return
    if (!session) { toast.error("กรุณาเข้าสู่ระบบก่อน"); return }
    setBusy(true)
    try {
      const result = await copyLinkAction(galleryId, link.id)
      if (!result.ok) {
        const msgs: Record<string, string> = {
          role_too_low: "ต้องการ Role สูงขึ้น",
          copy_limit_reached: "ถึงขีดจำกัดการ copy แล้ว",
          rate_limited: "ทำถี่เกินไป ลองใหม่อีกครั้ง",
          not_logged_in: "กรุณาเข้าสู่ระบบก่อน",
        }
        toast.error(msgs[result.reason] ?? result.reason); return
      }
      await navigator.clipboard.writeText(result.url)
      if ("vibrate" in navigator) navigator.vibrate(30)
      setCopied(true)
      toast.success("คัดลอกลิงก์แล้ว ✓")
      setTimeout(() => setCopied(false), 2000)
    } catch { toast.error("คัดลอกไม่สำเร็จ") }
    finally { setBusy(false) }
  }

  const handleOpen = () => {
    if (!link.is_active) return
    if ("vibrate" in navigator) navigator.vibrate(15)
    window.open(link.url, "_blank", "noopener,noreferrer")
  }

  const displayUrl = (() => {
    try {
      const u = new URL(link.url)
      const path = u.pathname.length > 22 ? u.pathname.slice(0, 22) + "…" : u.pathname
      return u.hostname + path
    } catch { return link.url.slice(0, 38) + (link.url.length > 38 ? "…" : "") }
  })()

  const hasLinkAccess =
    !!session &&
    (link.accessible_by_min_level === 0 ||
      session.max_hierarchy_level >= link.accessible_by_min_level)

  const isRoleLocked = !!session && link.is_active && !hasLinkAccess
  const isLocked = !session || !link.is_active || isRoleLocked

  return (
    <div className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      isRoleLocked
        ? "bg-amber-950/20 border border-amber-800/20 opacity-70"
        : isLocked
          ? "bg-white/3 border border-white/5 opacity-55"
          : "bg-white/5 border border-white/8 hover:bg-white/8 hover:border-white/15"
    }`}>
      <div className="shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
        {isRoleLocked
          ? <Lock size={10} className="text-amber-500/80" />
          : <span className="text-[10px] font-bold text-zinc-400">{idx + 1}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        {link.label && <p className="text-xs font-semibold text-zinc-300 truncate mb-0.5">{link.label}</p>}
        <p className="text-xs text-zinc-500 truncate font-mono">
          {isRoleLocked ? "••••••••••••••••••••" : displayUrl}
        </p>
        {!link.is_active && (
          <span className="inline-block mt-1 text-[10px] bg-red-950/60 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full">
            {NULL_REASON_LABELS[link.null_reason ?? ""] ?? "ไม่ใช้งานแล้ว"}
          </span>
        )}
        {isRoleLocked && (
          <span className="inline-block mt-1 text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/40 px-1.5 py-0.5 rounded-full">
            ต้องการ Role สูงขึ้น
          </span>
        )}
      </div>
      {link.is_active && !isRoleLocked && (
        <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums hidden group-hover:block">
          {link.total_copies} copy
        </span>
      )}
      {link.is_active && !isRoleLocked && (
        <button onClick={handleOpen} aria-label="เปิดลิงก์"
          className="shrink-0 p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all active:scale-90">
          <ExternalLink size={13} />
        </button>
      )}
      <button onClick={handleCopy} disabled={busy || !link.is_active || isRoleLocked}
        aria-label={copied ? "Copied!" : "ค��ดลอกลิงก์"}
        className={`shrink-0 p-2 rounded-lg transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed ${
          copied ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-400 hover:text-white hover:bg-white/10"
        }`}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────
   🔧 FIX: MediaItem — แยก loading strategy ชัดเจน
   
   ปัญหาเดิม: รูปแสดง skeleton/loading loop เพราะ
   1. opacity-0 → opacity-100 transition ทำงานก่อน onLoad fire
   2. GIF ไม่มี skeleton แต่ static image มี → flash ต่างกัน
   3. object-cover + object-top ทำให้รูป render แต่ invisible จาก CSS
   
   แก้: ใช้ isLoaded state ต่อ element, GIF ไม่ต้องรอ onLoad
───────────────────────────────────────────── */
function MediaItem({
  url,
  alt,
  className,
  isFirst,
  onLoad,
  onError,
}: {
  url: string
  alt: string
  className: string
  isFirst: boolean
  onLoad: () => void
  onError: () => void
}) {
  const isGif = isGifUrl(url)
  const isVideo = isVideoUrl(url)

  // GIF: fire onLoad immediately (browser decode ต่างกัน, onLoad อาจไม่ fire)
  const gifRef = useRef(false)
  useEffect(() => {
    if (isGif && !gifRef.current) {
      gifRef.current = true
      // หน่วง 1 frame เพื่อให้ DOM mount ก่อน
      const t = requestAnimationFrame(() => onLoad())
      return () => cancelAnimationFrame(t)
    }
  }, [isGif, onLoad])

  if (isVideo) {
    return (
      <video
        src={url}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={onLoad}
        onCanPlay={onLoad}  // 🔧 FIX: เพิ่ม onCanPlay เพื่อ catch กรณี loadedData ไม่ fire
        onError={onError}
        style={{ objectFit: "cover", objectPosition: "top" }}
      />
    )
  }

  if (isGif) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt={alt}
        className={className}  // 🔧 FIX: ไม่ใส่ opacity transition สำหรับ GIF
        loading={isFirst ? "eager" : "lazy"}
        onLoad={onLoad}
        onError={onError}
        referrerPolicy="strict-origin-when-cross-origin"
        draggable={false}
        decoding="sync"  // 🔧 FIX: sync decode สำหรับ GIF เพื่อหลีกเลี่ยง blank frame
        fetchPriority={isFirst ? "high" : "low"}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading={isFirst ? "eager" : "lazy"}
      fetchPriority={isFirst ? "high" : "auto"}  // 🔧 FIX: hint browser ให้โหลดรูปแรกก่อน
      decoding={isFirst ? "sync" : "async"}       // 🔧 FIX: รูปแรก sync decode = ไม่มี flicker
      onLoad={onLoad}
      onError={(e) => {
        e.currentTarget.src = "/placeholder.svg"
        e.currentTarget.style.opacity = "0.1"
        onError()
      }}
      referrerPolicy="strict-origin-when-cross-origin"
      draggable={false}
    />
  )
}

/* ─────────────────────────────────────────────
   FULLSCREEN VIEWER — เพิ่ม pinch-to-zoom + download
───────────────────────────────────────────── */
function FullscreenViewer({
  images,
  startIndex,
  onClose,
}: {
  images: { id: string; url: string; caption?: string }[]
  startIndex: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const lastPinchDist = useRef<number | null>(null)

  // Reset zoom/pan on image change
  useEffect(() => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [current])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && zoom === 1) setCurrent((c) => (c - 1 + images.length) % images.length)
      if (e.key === "ArrowRight" && zoom === 1) setCurrent((c) => (c + 1) % images.length)
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 4))
      if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 1))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [images.length, onClose, zoom])

  // Pinch-to-zoom touch handler
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (lastPinchDist.current !== null) {
        const delta = dist - lastPinchDist.current
        setZoom((z) => Math.max(1, Math.min(4, z + delta * 0.01)))
      }
      lastPinchDist.current = dist
    } else if (e.touches.length === 1 && zoom > 1) {
      if (isPanning.current) {
        const dx = e.touches[0].clientX - lastPan.current.x
        const dy = e.touches[0].clientY - lastPan.current.y
        setPanOffset((p) => ({ x: p.x + dx, y: p.y + dy }))
        lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isPanning.current = true
      lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    if (e.touches.length === 2) lastPinchDist.current = null
  }

  const handleTouchEnd = () => {
    isPanning.current = false
    lastPinchDist.current = null
    // snap back if zoom reset
    if (zoom <= 1) setPanOffset({ x: 0, y: 0 })
  }

  // Double-tap to zoom
  const lastTap = useRef(0)
  const handleDoubleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      setZoom((z) => (z === 1 ? 2.5 : 1))
      setPanOffset({ x: 0, y: 0 })
    }
    lastTap.current = now
  }

  const img = images[current]
  const isGif = isGifUrl(img.url)
  const isVideo = isVideoUrl(img.url)

  const handleDownload = async () => {
    try {
      const a = document.createElement("a")
      a.href = img.url
      a.download = img.caption ?? `image-${current + 1}`
      a.target = "_blank"
      a.click()
    } catch {
      toast.error("ดาวน์โหลดไม่สำเร็จ")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={zoom === 1 ? onClose : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {!isVideo && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(1, z - 0.5)); if (zoom <= 1.5) setPanOffset({ x: 0, y: 0 }) }}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              aria-label="ซูมออก"
            >
              <ZoomOut size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4, z + 0.5)) }}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              aria-label="ซูมเข��า"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload() }}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              aria-label="ดาวน์โหลด"
            >
              <Download size={15} />
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
          aria-label="ปิด fullscreen"
        >
          <Minimize2 size={18} />
        </button>
      </div>

      {zoom > 1 && (
        <div className="absolute top-4 left-4 z-10 px-2 py-1 rounded-full bg-black/60 border border-white/15 text-[11px] text-white/60 font-mono">
          {Math.round(zoom * 100)}%
        </div>
      )}

      {images.length > 1 && zoom === 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + images.length) % images.length) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 flex items-center justify-center text-white transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % images.length) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 flex items-center justify-center text-white transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <div
        className="max-w-[95vw] max-h-[90vh] flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={handleDoubleTap}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        {isVideo ? (
          <video
            key={img.url}
            src={img.url}
            className="max-w-full max-h-[85vh] rounded-lg"
            autoPlay
            loop
            muted
            playsInline
            controls
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.url}
            src={img.url}
            alt={img.caption ?? `รูปที่ ${current + 1}`}
            className="max-w-full max-h-[85vh] rounded-lg object-contain select-none"
            referrerPolicy="strict-origin-when-cross-origin"
            draggable={false}
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
              transition: isPanning.current ? "none" : "transform 0.2s ease",
            }}
          />
        )}
      </div>

      {img.caption && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 rounded-xl text-sm text-white/80 max-w-[80vw] text-center">
          {img.caption}
        </div>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setCurrent(idx) }}
              className={`rounded-full transition-all ${idx === current ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"}`}
            />
          ))}
        </div>
      )}

      {isGif && (
        <div className="absolute top-4 left-4 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 border border-white/20 text-[10px] text-white/70 font-bold">
          GIF
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   🔧 FIX: IMAGE CAROUSEL
   
   Root cause ของ "โหลดตลอดเวลา":
   1. loadedMap[idx] เริ่มต้น {} ทั้งหมด → Skeleton render ซ้อนทุกรูป
   2. transition opacity-0 → opacity-100 ทำงานซ้ำเมื่อ re-render
   3. GIF ไม่ได้ mark loaded → Skeleton ค้างตลอด

   แก้:
   - preloadedUrls Set: track URLs ที่ browser cache แล้ว
   - GIF → mark loaded ทันที ไม่รอ onLoad
   - Skeleton แสดงเฉพาะเมื่อ !isLoaded && isActive (ไม่แสดงทุก slot)
   - isActive slot เท่านั้นที่ opacity-100 ได้
───────────────────────────────────────────── */

// Module-level cache: เก็บ URL ที่โหลดแล้วข้าม render cycle
const preloadedUrls = new Set<string>()

function ImageCarousel({
  images,
  hasAccess,
  roleName,
}: {
  images: { id: string; url: string; caption?: string }[]
  hasAccess: boolean
  roleName: string
}) {
  const [current, setCurrent] = useState(0)
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>(() => {
    // 🔧 FIX: Pre-populate loadedMap จาก cache เพื่อหลีกเลี่ยง skeleton flash ซ้ำ
    const initial: Record<number, boolean> = {}
    images.forEach((img, idx) => {
      if (preloadedUrls.has(img.url) || isGifUrl(img.url)) {
        initial[idx] = true
      }
    })
    return initial
  })
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    setCurrent(0)
    // 🔧 FIX: อย่า reset loadedMap ถ้า images ชุดเดิม — ป้องกัน skeleton flash
    setLoadedMap(() => {
      const next: Record<number, boolean> = {}
      images.forEach((img, idx) => {
        if (preloadedUrls.has(img.url) || isGifUrl(img.url)) {
          next[idx] = true
        }
      })
      return next
    })
  }, [images])

  const markLoaded = useCallback((idx: number, url: string) => {
    preloadedUrls.add(url) // cache ใน module scope
    setLoadedMap((prev) => {
      if (prev[idx]) return prev // ป้องกัน re-render ซ้ำ
      return { ...prev, [idx]: true }
    })
  }, [])

  const prev = () => setCurrent((c) => (c - 1 + images.length) % images.length)
  const next = () => setCurrent((c) => (c + 1) % images.length)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || images.length <= 1) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > 40) delta < 0 ? next() : prev()
    touchStartX.current = null
  }

  const multi = images.length > 1

  return (
    <>
      {fullscreenIndex !== null && hasAccess && (
        <FullscreenViewer
          images={images}
          startIndex={fullscreenIndex}
          onClose={() => setFullscreenIndex(null)}
        />
      )}

      <div
        className="relative w-full bg-zinc-900 overflow-hidden select-none"
        style={{ aspectRatio: "16/9" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.map((img, idx) => {
          const isGif = isGifUrl(img.url)
          const isLoaded = !!loadedMap[idx]
          const isActive = idx === current

          return (
            <div
              key={img.id}
              className={`absolute inset-0 transition-opacity duration-300 ${isActive ? "opacity-100 z-10" : "opacity-0 z-0"}`}
            >
              {/* 🔧 FIX: Skeleton แสดงเฉพาะ slot ที่ active และยังไม่โหลด */}
              {!isLoaded && !isGif && isActive && (
                <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
              )}

              <div
                className="absolute inset-0 cursor-pointer"
                onClick={() => hasAccess && setFullscreenIndex(idx)}
                title={hasAccess ? "คลิกเพื่อดูแบบเต็มจอ" : undefined}
              >
                <MediaItem
                  url={img.url}
                  alt={img.caption ?? `รูปที่ ${idx + 1}`}
                  isFirst={idx === 0}
                  className={[
                    "w-full h-full object-cover object-top",
                    // 🔧 FIX: GIF ไม่ต้องมี opacity transition — แสดงทันที
                    isGif
                      ? "opacity-100"
                      : `transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`,
                    hasAccess ? "" : "brightness-50 saturate-50",
                  ].join(" ")}
                  onLoad={() => markLoaded(idx, img.url)}
                  onError={() => markLoaded(idx, img.url)}
                />
              </div>

              {img.caption && isLoaded && hasAccess && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 z-10 pointer-events-none">
                  <p className="text-xs text-white/80 leading-snug">{img.caption}</p>
                </div>
              )}

              {isGif && hasAccess && (
                <div className="absolute top-2 left-2 z-20 px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-[9px] font-bold text-white/70 tracking-wider">
                  GIF
                </div>
              )}
            </div>
          )
        })}

        {/* 🔧 Preload next image (non-video only) */}
        {multi && images[(current + 1) % images.length] && !isVideoUrl(images[(current + 1) % images.length].url) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[(current + 1) % images.length].url}
            alt=""
            aria-hidden
            className="absolute -top-full w-0 h-0 opacity-0 pointer-events-none"
            loading="eager"
            onLoad={() => {
              const nextIdx = (current + 1) % images.length
              markLoaded(nextIdx, images[nextIdx].url)
            }}
          />
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0f0f11] via-transparent to-transparent pointer-events-none z-20" />

        {!hasAccess && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-md z-30">
            <div className="w-14 h-14 rounded-2xl bg-white/8 border border-white/12 flex items-center justify-center">
              <Lock size={24} className="text-zinc-300" />
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-300 font-medium mb-1.5">ต้องการ Role นี้เพื่อดูเนื้อหา</p>
              <RoleBadge role={roleName} size="md" />
            </div>
          </div>
        )}

        {hasAccess && (
          <button
            onClick={() => setFullscreenIndex(current)}
            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/85 border border-white/10 hidden sm:flex items-center justify-center text-white/60 hover:text-white transition-all"
            aria-label="ดูแบบเต็มจอ"
            style={{ right: multi ? "2.5rem" : "0.5rem" }}
          >
            <Maximize2 size={12} />
          </button>
        )}

        {multi && hasAccess && (
          <>
            <button onClick={prev} aria-label="รูปก่อนหน้า"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 hidden sm:flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90">
              <ChevronLeft size={16} />
            </button>
            <button onClick={next} aria-label="รูปถัดไป"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 hidden sm:flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90">
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {multi && hasAccess && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
            {images.map((_, idx) => (
              <button key={idx} onClick={() => setCurrent(idx)}
                className={`rounded-full transition-all ${idx === current ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"}`}
                aria-label={`ไปรูปที่ ${idx + 1}`}
              />
            ))}
          </div>
        )}

        {multi && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-black/70 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.6)] border border-white/12">
            <Images size={11} className="text-white/60" />
            <span className="text-[11px] font-bold text-white tabular-nums leading-none">{current + 1}</span>
            <span className="text-[10px] text-white/35 font-medium leading-none">/</span>
            <span className="text-[10px] text-white/50 font-semibold tabular-nums leading-none">{images.length}</span>
          </div>
        )}
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────
   READER MODE — Doujin-style vertical scroll viewer
───────────────────────────────────────────── */
function ReaderMode({
  images,
  title,
  onClose,
}: {
  images: { id: string; url: string; caption?: string }[]
  title: string
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const imgRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const maxScroll = scrollHeight - clientHeight
    setScrollProgress(maxScroll > 0 ? scrollTop / maxScroll : 0)

    const mid = scrollTop + clientHeight / 2
    let found = 0
    for (let i = 0; i < imgRefs.current.length; i++) {
      const ref = imgRefs.current[i]
      if (!ref) continue
      if (ref.offsetTop <= mid) found = i
    }
    setCurrentPage(found + 1)
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#0a0a0c]">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-10">
        <div
          className="h-full bg-white/60 transition-all duration-100"
          style={{ width: `${scrollProgress * 100}%` }}
        />
      </div>

      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/8 z-10">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:scale-90 text-zinc-400 hover:text-white transition-all touch-manipulation"
          aria-label="ออกจากโหมดอ่าน"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          <p className="text-[11px] text-zinc-500">{currentPage} / {images.length} รูป</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/10">
          <BookOpen size={12} className="text-zinc-400" />
          <span className="text-[11px] text-zinc-400 font-medium">อ่าน</span>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.12) transparent" }}
      >
        <div className="flex flex-col items-center gap-1 py-2 px-0 sm:px-4 sm:gap-2">
          {images.map((img, idx) => {
            const isGif = isGifUrl(img.url)
            const isVideo = isVideoUrl(img.url)

            return (
              <div
                key={img.id}
                ref={(el) => { imgRefs.current[idx] = el }}
                className="w-full max-w-2xl"
              >
                {isVideo ? (
                  <video
                    src={img.url}
                    className="w-full block"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                    style={{ display: "block" }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.url}
                    alt={img.caption ?? `รูปที่ ${idx + 1}`}
                    className="w-full block"
                    loading={idx < 3 ? "eager" : "lazy"}
                    referrerPolicy="strict-origin-when-cross-origin"
                    draggable={false}
                    decoding={isGif ? "sync" : "async"}
                    style={{ display: "block" }}
                  />
                )}
                {img.caption && (
                  <p className="text-[11px] text-zinc-500 text-center py-2 px-4 bg-black/40">
                    {img.caption}
                  </p>
                )}
              </div>
            )
          })}
          <div className="py-8 flex flex-col items-center gap-2">
            <div className="w-16 h-px bg-white/10" />
            <p className="text-xs text-zinc-600">จบ · {images.length} รูป</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   MAIN MODAL
───────────────────────────────────────────── */
interface GalleryDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gallery: Gallery | null
  session: SessionUser | null
  tags: Tag[]
  uploaderName: string
  /** ✅ v3.5: optional — ใช้ตรวจ locked state ตอนเปิดผ่าน share link */
  allGalleries?: Gallery[]
}

export function GalleryDetailModal({
  open, onOpenChange, gallery, session, tags, uploaderName,
}: GalleryDetailModalProps) {
  const { isFav, toggle: toggleFav } = useFavorites(session)

  const [isDragging, setIsDragging] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [viewFired, setViewFired] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  const DRAG_CLOSE_THRESHOLD = 130

  const handleClose = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate([10, 5, 10])
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    setDragOffsetY(0); setViewFired(false); setShowInactive(false); setReaderOpen(false)
  }, [gallery?.id])

  useEffect(() => {
    if (open && gallery && session && !viewFired) {
      setViewFired(true)
      openGalleryAction(gallery.id).catch(() => { })
    }
  }, [open, gallery, session, viewFired])

  useEffect(() => {
    if (!readerOpen) {
      document.body.style.overflow = open ? "hidden" : ""
    }
    return () => { if (!readerOpen) document.body.style.overflow = "" }
  }, [open, readerOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && open && !readerOpen) handleClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, handleClose, readerOpen])

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true); setDragStartY(e.touches[0].clientY); setDragOffsetY(0)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const delta = e.touches[0].clientY - dragStartY
    if (delta > 0) setDragOffsetY(delta)
  }
  const onTouchEnd = () => {
    setIsDragging(false)
    if (dragOffsetY > DRAG_CLOSE_THRESHOLD) handleClose()
    else setDragOffsetY(0)
  }

  if (!open || !gallery) return null

  const hasAccess = canAccessGallery(session, gallery)
  const isFaved = isFav(gallery.id)
  const activeLinks = gallery.links.filter((l) => l.is_active)
  const inactiveLinks = gallery.links.filter((l) => !l.is_active)
  const tagIdToDisplay = new Map(tags.map((t) => [t.id, t.display ?? t.name]))
  const roleCfg = ROLE_CONFIG[gallery.access.min_role_name] ?? ROLE_CONFIG["69Bath"]

  const galleryImages = getGalleryImages(gallery)
  const canRead = hasAccess && galleryImages.length > 0

  const sheetStyle: React.CSSProperties = {
    transform: `translateY(${dragOffsetY}px)`,
    transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.32,0.72,0,1)",
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/?g=${gallery.id}`
    try {
      if (navigator.share) await navigator.share({ title: gallery.title, url })
      else { await navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์แชร์แล้ว") }
    } catch { }
  }

  return (
    <>
      {readerOpen && canRead && (
        <ReaderMode
          images={galleryImages}
          title={gallery.title}
          onClose={() => setReaderOpen(false)}
        />
      )}

      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-6"
        style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        role="dialog"
        aria-modal="true"
        aria-label={gallery.title}
      >
        <div
          ref={sheetRef}
          style={sheetStyle}
          className={[
            "relative flex flex-col bg-[#0f0f11] overflow-hidden",
            "w-full rounded-t-3xl max-h-[94dvh]",
            "border-t border-white/8",
            "shadow-[0_-12px_60px_rgba(0,0,0,0.7)]",
            "sm:w-full sm:max-w-lg",
            "sm:rounded-2xl",
            "sm:border sm:border-white/10",
            "sm:max-h-[88vh]",
            "sm:shadow-[0_32px_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.05)]",
          ].join(" ")}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* DRAG HANDLE */}
          <div className="flex justify-center pt-3 pb-2 shrink-0 sm:hidden">
            <div className="w-9 h-[3px] rounded-full bg-white/20" />
          </div>

          {/* TOP BAR */}
          <div className="flex items-center justify-between px-4 pt-3 pb-3 shrink-0 sm:pt-4 sm:px-5">
            <div className="flex flex-wrap gap-1.5 min-w-0 flex-1 items-center">
              {/* ✅ FIX v3.2: แสดงเฉพาะ tag ที่มี display name — ซ่อน UUID ดิบ */}
              {gallery.tags.filter((tagId) => tagIdToDisplay.has(tagId)).map((tagId) => (
                <span key={tagId}
                  className="text-[10px] font-bold text-purple-400 tracking-widest uppercase bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded-full">
                  #{tagIdToDisplay.get(tagId)}
                </span>
              ))}
              {gallery.is_pinned && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-700/40 px-2 py-0.5 rounded-full">
                  📌 ปักหมุด
                </span>
              )}
              {/* Gallery ID — แสดงเล็กๆ เป็น monospace ข้างหลัง tags */}
              <span
                title={gallery.id}
                className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors cursor-default select-all leading-none ml-0.5"
              >
                {gallery.id.slice(0, 8)}…
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canRead && (
                <button
                  onClick={() => {
                    if ("vibrate" in navigator) navigator.vibrate(15)
                    setReaderOpen(true)
                  }}
                  aria-label="โหมดอ่าน"
                  title="โหมดอ่าน"
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:scale-90 transition-all text-zinc-400 hover:text-white touch-manipulation"
                >
                  <BookOpen size={15} />
                </button>
              )}
              <button onClick={handleShare} aria-label="แชร์"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:scale-90 transition-all text-zinc-400 hover:text-white touch-manipulation">
                <Share2 size={15} />
              </button>
              <button
                onClick={() => { if ("vibrate" in navigator) navigator.vibrate(20); toggleFav(gallery.id) }}
                aria-label={isFaved ? "ยกเลิก Favorite" : "เพิ่ม Favorite"}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90 touch-manipulation ${isFaved ? "bg-red-500/20 border border-red-500/40" : "bg-white/8 hover:bg-white/14"}`}>
                <Heart size={16} className={isFaved ? "fill-red-500 text-red-500" : "text-zinc-400"} />
              </button>
              <button onClick={handleClose} aria-label="ปิด"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:scale-90 text-zinc-400 hover:text-white transition-all touch-manipulation">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* SCROLLABLE BODY */}
          <div className="flex-1 overflow-y-auto overscroll-contain">

            <ImageCarousel
              images={galleryImages}
              hasAccess={hasAccess}
              roleName={gallery.access.min_role_name}
            />

            {/* TITLE + STATS */}
            <div className="px-4 pt-4 pb-3 sm:px-5">
              <h2 className="text-[18px] font-bold text-white leading-snug mb-3 tracking-tight">
                {gallery.title}
              </h2>

              <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                <StatChip icon={<Eye size={13} />} value={gallery.stats.total_views} label="Views" />
                <StatChip icon={<ClipboardList size={13} />} value={gallery.stats.total_copies} label="Copies" />
                <StatChip icon={<Users size={13} />} value={gallery.stats.unique_openers} label="Unique" />
                <StatChip icon={<Zap size={13} />} value={activeLinks.length} label="Links" />
                {galleryImages.length > 1 && (
                  <StatChip icon={<Images size={13} />} value={galleryImages.length} label="รูป" />
                )}
              </div>

              {gallery.description && hasAccess && (
                <p className="text-sm text-zinc-400 leading-relaxed mb-3 whitespace-pre-line">
                  {gallery.description}
                </p>
              )}
              {gallery.description && !hasAccess && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-white/4 border border-white/8 flex items-center gap-2">
                  <Lock size={11} className="shrink-0 text-zinc-600" />
                  <p className="text-xs text-zinc-600 italic">ต้องการ Role เพื่อดูรายละเอียด</p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                <span>อัปโหลด {formatUploadDate(gallery.uploaded_at)}</span>
                {gallery.updated_at !== gallery.uploaded_at && (
                  <span>• แก้ไข {timeAgo(gallery.updated_at)}</span>
                )}
                <span>• โดย <span className="text-zinc-500">{uploaderName || gallery.uploaded_by}</span></span>
              </div>
            </div>

            <div className="mx-4 h-px bg-white/6 mb-3 sm:mx-5" />

            {/* NOT LOGGED IN */}
            {!session && (
              <div className="mx-4 mb-4 p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 flex items-start gap-3 sm:mx-5">
                <div className="shrink-0 w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center mt-0.5">
                  <AlertCircle size={15} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300 mb-0.5">ยังไม่ได้เข้าสู่ระบบ</p>
                  <p className="text-xs text-amber-500/80 leading-relaxed">
                    เข้าสู่ระบบด้วย Discord เพื่อดูลิงก์และใช้งาน Gallery นี้
                  </p>
                </div>
              </div>
            )}

            {/* LINKS */}
            {hasAccess && gallery.links.length > 0 && (
              <div className="mx-4 mb-4 sm:mx-5">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">ลิงก์ทั้งหมด</p>
                  <span className="text-xs text-zinc-600">
                    {activeLinks.length} ใช้ได้ · {inactiveLinks.length} หมดอายุ
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {activeLinks.map((link, i) => (
                    <LinkRow key={link.id} link={link} galleryId={gallery.id} session={session} idx={i} />
                  ))}
                </div>
                {inactiveLinks.length > 0 && (
                  <div className="mt-2">
                    <button onClick={() => setShowInactive((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1 w-full">
                      {showInactive ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      ลิงก์ที่หมดอายุแล้ว ({inactiveLinks.length})
                    </button>
                    {showInactive && (
                      <div className="flex flex-col gap-2 mt-1.5">
                        {inactiveLinks.map((link, i) => (
                          <LinkRow key={link.id} link={link} galleryId={gallery.id} session={session}
                            idx={activeLinks.length + i} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* NO ACCESS TEASER */}
            {session && !hasAccess && (
              <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-white/8 sm:mx-5">
                <div className={`p-4 ${roleCfg.bg} border-b border-white/6`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Crown size={14} className="text-zinc-400" />
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">ต้องการสิทธิ์</p>
                  </div>
                  <RoleBadge role={gallery.access.min_role_name} size="lg" />
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                    ซื้อ Role นี้เพื่อปลดล็อค {gallery.links.length} ลิงก์ในคอลเลกชันนี้
                  </p>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {gallery.links.slice(0, 3).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl bg-white/4 border border-white/6 flex items-center px-4 gap-3">
                      <div className="w-5 h-5 rounded-full bg-white/8" />
                      <div className="flex-1 flex flex-col gap-1.5">
                        <div className="h-2 w-24 rounded-full bg-white/8" />
                        <div className="h-1.5 w-36 rounded-full bg-white/6" />
                      </div>
                      <Lock size={12} className="text-zinc-700" />
                    </div>
                  ))}
                  {gallery.links.length > 3 && (
                    <p className="text-center text-[11px] text-zinc-700">+{gallery.links.length - 3} ลิงก์อื่นๆ</p>
                  )}
                </div>
              </div>
            )}

            <div className="h-28 sm:h-4" />
          </div>

          {/* STICKY CTA */}
          <div
            className="shrink-0 px-4 pt-3 bg-[#0f0f11]/95 backdrop-blur-xl border-t border-white/8 sm:px-5 sm:pb-4"
            style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
          >
            {hasAccess ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-600 mb-1">สิทธิ์ของคุณ</p>
                  <div className="flex flex-wrap gap-1.5">
                    {session?.active_roles.map((r) => <RoleBadge key={r} role={r} />)}
                  </div>
                </div>
                <button onClick={handleClose}
                  className="shrink-0 px-5 h-11 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 active:bg-white/8 text-white transition-all active:scale-[0.98] touch-manipulation border border-white/10">
                  ปิด
                </button>
              </div>
            ) : session ? (
              <button
                onClick={() => {
                  if ("vibrate" in navigator) navigator.vibrate([20, 10, 30])
                  toast.info(`ต้องการ Role ${gallery.access.min_role_name}`, { description: "ติดต่อแอดมินเพื่ออัปเกรด Role" })
                }}
                className={`w-full h-12 flex items-center justify-center gap-2.5 rounded-2xl font-bold text-base text-white transition-all duration-150 active:scale-[0.98] touch-manipulation ${roleCfg.bg} border ${roleCfg.border} ${roleCfg.glow}`}>
                <ShoppingBag size={18} strokeWidth={2} />
                <span>
                  อัปเกรดเป็น{" "}
                  <span className={`${roleCfg.text} font-extrabold`}>{gallery.access.min_role_name}</span>
                </span>
              </button>
            ) : (
              <button
                onClick={() => toast.info("กรุณาเข้าสู่ระบบด้วย Discord", { description: "คลิกปุ่ม Login ที่มุมบนขวา" })}
                className="w-full h-12 flex items-center justify-center gap-2.5 rounded-2xl font-bold text-base bg-[#5865F2] hover:bg-[#4752C4] active:bg-[#3b44a9] text-white transition-all duration-150 active:scale-[0.98] touch-manipulation shadow-[0_4px_20px_rgba(88,101,242,0.4)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                </svg>
                เข้าสู่ระบบด้วย Discord
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
