"use client"

/**
 * components/admin/ThumbnailUrlManager.tsx
 *
 * v2.0 — Paragraph Textarea Mode + Smart Features
 *
 * NEW in v2:
 * ─ Paragraph textarea (ใส่ URL ได้หลายบรรทัดในช่องเดียว)
 * ─ Smart duplicate detection + live URL validation ก่อน Add
 * ─ Undo last delete (5s window)
 * ─ Drag-to-reorder rows (native HTML5 drag)
 * ─ Import stats feedback (เพิ่มกี่ รูป / ซ้ำกี่ / invalid กี่)
 * ─ Keyboard shortcut: Ctrl+Enter / Cmd+Enter to Add
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react"
import type { GalleryImage } from "@/lib/types"
import { isVideoUrl } from "@/lib/types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    if (url.startsWith("/")) return true
    new URL(url)
    return true
  } catch {
    return false
  }
}

function parseLines(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThumbnailUrlManagerProps {
  images: GalleryImage[]
  onChange: (images: GalleryImage[]) => void
  placeholder?: string
  maxImages?: number
  disabled?: boolean
}

// ─── Sub: Checkbox ─────────────────────────────────────────────────────────

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
        checked
          ? "bg-[#2563eb] border-[#2563eb] ring-2 ring-blue-500/20"
          : "bg-transparent border-[#2a2a3e] hover:border-[#3a3a5a]"
      }`}
    >
      {checked && (
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          fill="none"
          className="animate-in fade-in zoom-in duration-200"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}

// ─── Sub: MediaPreview ─────────────────────────────────────────────────────

function MediaPreview({ url, isThumb }: { url: string; isThumb: boolean }) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [url])

  if (error) {
    return (
      <div className="w-12 h-10 rounded bg-[#0d0d15] border border-red-900/30 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] text-red-500 font-bold">DEAD</span>
      </div>
    )
  }

  const commonClass =
    "w-12 h-10 object-cover rounded border border-[#1e1e2e] flex-shrink-0 transition-transform hover:scale-110 z-10"

  return (
    <div className="relative">
      {isVideoUrl(url) ? (
        <video
          src={url}
          className={commonClass}
          muted
          loop
          autoPlay
          playsInline
          onError={() => setError(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Gallery Preview"
          className={commonClass}
          loading="lazy"
          onError={() => setError(true)}
        />
      )}
      {isThumb && (
        <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-[8px] font-black px-1 rounded shadow-lg z-20 select-none">
          THUMB
        </div>
      )}
    </div>
  )
}

// ─── Sub: ImportStats ─────────────────────────────────────────────────────

function ImportStats({
  stats,
  onDismiss,
}: {
  stats: { added: number; skipped: number; invalid: number }
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d0d15] border border-[#1e1e2e] text-[11px] font-mono animate-in fade-in slide-in-from-top-1 duration-200">
      {stats.added > 0 && (
        <span className="text-green-400">✓ +{stats.added}</span>
      )}
      {stats.skipped > 0 && (
        <span className="text-amber-400">⊘ ซ้ำ {stats.skipped}</span>
      )}
      {stats.invalid > 0 && (
        <span className="text-red-400">✗ invalid {stats.invalid}</span>
      )}
      {stats.added === 0 && stats.invalid === 0 && stats.skipped === 0 && (
        <span className="text-neutral-500">—</span>
      )}
    </div>
  )
}

// ─── Sub: UndoToast ───────────────────────────────────────────────────────

function UndoToast({
  count,
  onUndo,
  onDismiss,
}: {
  count: number
  onUndo: () => void
  onDismiss: () => void
}) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const duration = 5000
    const tick = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct === 0) {
        clearInterval(tick)
        onDismiss()
      }
    }, 50)
    return () => clearInterval(tick)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#12121e] border border-[#2a2a3e] shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
      <span className="text-xs text-neutral-400 font-mono">
        ลบ {count} รูปแล้ว
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
      >
        Undo
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-[2px] bg-blue-600 rounded-b-xl transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ThumbnailUrlManager({
  images,
  onChange,
  placeholder = "/collection-thumb.jpg or https://...\n(วางหลาย URL ได้ — 1 link ต่อ 1 บรรทัด)",
  maxImages = 100,
  disabled = false,
}: ThumbnailUrlManagerProps) {
  const [inputValue, setInputValue] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importStats, setImportStats] = useState<{
    added: number
    skipped: number
    invalid: number
  } | null>(null)
  const [undoStack, setUndoStack] = useState<GalleryImage[] | null>(null)
  const [showUndo, setShowUndo] = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragSrc = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // live parse
  const lines = parseLines(inputValue)
  const validLines = lines.filter(isValidUrl)
  const invalidLines = lines.filter((l) => !isValidUrl(l))
  const existingUrls = new Set(images.map((img) => img.url))
  const newLines = validLines.filter((u) => !existingUrls.has(u))
  const dupeLines = validLines.filter((u) => existingUrls.has(u))

  // Sync selection
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>()
      images.forEach((img) => {
        if (prev.has(img.id)) next.add(img.id)
      })
      return next
    })
  }, [images])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    if (newLines.length === 0) return

    const canAdd = maxImages - images.length
    const toAdd = newLines.slice(0, canAdd)

    const newImages: GalleryImage[] = toAdd.map((url, i) => ({
      id: crypto.randomUUID(),
      url,
      sort_order: images.length + i,
      added_at: new Date().toISOString(),
    }))

    onChange([...images, ...newImages])
    setInputValue("")
    setImportStats({
      added: toAdd.length,
      skipped: dupeLines.length,
      invalid: invalidLines.length,
    })
    textareaRef.current?.focus()
  }, [newLines, dupeLines, invalidLines, images, onChange, maxImages])

  const handleDeleteOne = (id: string) => {
    setUndoStack(images)
    const next = images
      .filter((img) => img.id !== id)
      .map((img, i) => ({ ...img, sort_order: i }))
    onChange(next)
    setShowUndo(true)
  }

  const handleDeleteSelected = () => {
    if (selected.size === 0) return
    setUndoStack(images)
    const next = images
      .filter((img) => !selected.has(img.id))
      .map((img, i) => ({ ...img, sort_order: i }))
    onChange(next)
    setSelected(new Set())
    setShowUndo(true)
  }

  const handleUndo = () => {
    if (undoStack) {
      onChange(undoStack)
      setUndoStack(null)
      setShowUndo(false)
    }
  }

  const toggleAll = () => {
    if (selected.size === images.length && images.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(images.map((img) => img.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Drag reorder ─────────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    dragSrc.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOver(index)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (dragSrc.current === null || dragSrc.current === dropIndex) {
      setDragOver(null)
      return
    }
    const next = [...images]
    const [moved] = next.splice(dragSrc.current, 1)
    next.splice(dropIndex, 0, moved)
    dragSrc.current = null
    setDragOver(null)
    onChange(next.map((img, i) => ({ ...img, sort_order: i })))
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const canAdd = maxImages - images.length

  return (
    <div className={`space-y-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-black tracking-widest text-[#4a4a6a] uppercase select-none">
          Thumbnail URL
        </label>
        <div className="flex items-center gap-3">
          {importStats && (
            <ImportStats
              stats={importStats}
              onDismiss={() => setImportStats(null)}
            />
          )}
          <span className="text-[10px] text-[#2a2a3e] font-mono">
            {images.length}/{maxImages}
          </span>
        </div>
      </div>

      {/* ── PARAGRAPH TEXTAREA INPUT ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={4}
            disabled={images.length >= maxImages}
            className="w-full bg-[#09090f] border-2 border-[#1e1e2e] rounded-2xl px-5 py-3.5 text-sm text-white focus:border-blue-600 outline-none transition-all duration-300 placeholder:text-[#3a3a5a] shadow-inner font-mono resize-y min-h-[80px]"
            spellCheck={false}
          />

          {/* Live parse stats (แสดงเมื่อมีเนื้อหาใน textarea) */}
          {lines.length > 0 && (
            <div className="absolute bottom-3 right-4 flex items-center gap-2 pointer-events-none">
              {newLines.length > 0 && (
                <span className="text-[10px] text-green-400 font-mono bg-[#09090f]/80 px-1.5 py-0.5 rounded">
                  ✓ {newLines.length} ใหม่
                </span>
              )}
              {dupeLines.length > 0 && (
                <span className="text-[10px] text-amber-400 font-mono bg-[#09090f]/80 px-1.5 py-0.5 rounded">
                  ⊘ {dupeLines.length} ซ้ำ
                </span>
              )}
              {invalidLines.length > 0 && (
                <span className="text-[10px] text-red-400 font-mono bg-[#09090f]/80 px-1.5 py-0.5 rounded">
                  ✗ {invalidLines.length} invalid
                </span>
              )}
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="flex flex-col gap-2 justify-start pt-1">
          <button
            type="button"
            onClick={handleAdd}
            disabled={newLines.length === 0 || canAdd === 0}
            title="Ctrl+Enter / Cmd+Enter"
            className="w-14 h-14 rounded-full border-2 border-blue-600 flex items-center justify-center text-blue-500 hover:bg-blue-600 hover:text-white transition-all duration-300 text-2xl shadow-[0_0_15px_rgba(37,99,235,0.1)] active:scale-95 disabled:border-[#1e1e2e] disabled:text-[#1e1e2e]"
          >
            <span className="leading-none mt-[-2px]">+</span>
          </button>
          <div className="text-[9px] text-[#2a2a3e] text-center font-mono select-none">
            ⌘↵
          </div>
        </div>
      </div>

      {/* canAdd warning */}
      {images.length >= maxImages && (
        <p className="text-[11px] text-amber-500 font-mono">
          ⚠ ถึงขีดจำกัด {maxImages} รูปแล้ว
        </p>
      )}

      {/* ── DATA TABLE ── */}
      <div className="border-t border-[#1e1e2e] mt-6">
        {/* Table Header */}
        <div className="grid grid-cols-[32px_40px_60px_1fr_28px_60px] gap-3 py-3 px-2 text-[10px] font-bold text-[#4a4a6a] uppercase tracking-wider border-b border-[#111118] select-none">
          <div
            className="flex items-center cursor-pointer hover:text-white transition-colors"
            onClick={toggleAll}
            title="Select all"
          >
            ☐
          </div>
          <div>#</div>
          <div>image</div>
          <div>link</div>
          <div title="Drag to reorder">⠿</div>
          <div className="text-right">
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="text-red-500 hover:text-red-400 underline decoration-red-900 underline-offset-4 animate-pulse"
              >
                DEL ({selected.size})
              </button>
            ) : (
              "action"
            )}
          </div>
        </div>

        {/* Rows */}
        <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#1e1e2e]">
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={() => setDragOver(null)}
              className={`grid grid-cols-[32px_40px_60px_1fr_28px_60px] gap-3 py-3 px-2 items-center transition-all duration-150 border-b border-[#111118]/40 ${
                dragOver === i
                  ? "bg-blue-900/10 border-blue-600/40"
                  : selected.has(img.id)
                  ? "bg-blue-900/5"
                  : "hover:bg-[#111118]"
              }`}
            >
              {/* Checkbox */}
              <div
                className="flex items-center cursor-pointer"
                onClick={() => toggleSelect(img.id)}
              >
                <Checkbox checked={selected.has(img.id)} />
              </div>

              {/* Line number */}
              <div className="text-[10px] text-[#3a3a5a] font-mono">{i + 1}</div>

              {/* Preview */}
              <MediaPreview url={img.url} isThumb={i === 0} />

              {/* URL String */}
              <div className="min-w-0">
                <div
                  className="text-xs text-[#8b8baa] truncate font-mono select-all hover:text-white transition-colors cursor-text"
                  title={img.url}
                >
                  {img.url}
                </div>
              </div>

              {/* Drag handle */}
              <div
                className="text-[#2a2a3e] hover:text-[#4a4a6a] cursor-grab active:cursor-grabbing select-none text-center"
                title="ลากเพื่อเรียงลำดับ"
              >
                ⠿
              </div>

              {/* Delete */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => handleDeleteOne(img.id)}
                  aria-label="Remove image"
                  className="w-8 h-8 bg-[#2d0a0a] text-red-500 rounded-lg flex items-center justify-center ml-auto hover:bg-red-800 hover:text-red-200 transition-all active:scale-90 border border-red-900/20"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}

          {images.length === 0 && (
            <div className="py-12 text-center text-[#2a2a3e] italic text-xs">
              No thumbnails added yet.
            </div>
          )}
        </div>
      </div>

      {/* Undo Toast */}
      {showUndo && undoStack && (
        <UndoToast
          count={undoStack.length - images.length}
          onUndo={handleUndo}
          onDismiss={() => setShowUndo(false)}
        />
      )}
    </div>
  )
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
    </svg>
  )
}

export default ThumbnailUrlManager
