"use client";

import { useState, useCallback, useRef } from "react";
import {
  Plus,
  X,
  GripVertical,
  ImageOff,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Trash2,
  Crown,
  Pencil,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryImage } from "@/lib/types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface LocalImage {
  id: string;
  url: string;
  caption: string;
  isPrimary: boolean;
  status: "idle" | "loading" | "valid" | "error";
}

interface GalleryUrlManagerProps {
  label?: string;
  /** legacy: string[] — ใช้เมื่อ caller ยังไม่ migrate */
  value?: string[];
  onChange?: (urls: string[]) => void;
  /** new: รับ GalleryImage[] แบบ full-fat — เพิ่ม sort_order + caption */
  initialImages?: GalleryImage[];
  onImagesChange?: (images: GalleryImage[]) => void;
  maxImages?: number;
  placeholder?: string;
  className?: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

const isValidUrl = (url: string) => {
  try {
    if (url.startsWith("/")) return true;
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const toGalleryImages = (locals: LocalImage[]): GalleryImage[] =>
  locals.map((item, idx) => ({
    id: item.id,
    url: item.url,
    caption: item.caption || undefined,
    sort_order: idx,
    added_at: new Date().toISOString(),
  }));

// ─────────────────────────────────────────────
// Sub-component: ImagePreviewCard
// ─────────────────────────────────────────────
function ImagePreviewCard({
  item,
  index,
  total,
  isSelected,
  onSelect,
  onRemove,
  onUrlChange,
  onCaptionChange,
  onSetPrimary,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: {
  item: LocalImage;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onUrlChange: (id: string, url: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onSetPrimary: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragTarget: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgStatus, setImgStatus] = useState<"loading" | "ok" | "fail">("loading");
  const [captionOpen, setCaptionOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const showPreview = item.url && isValidUrl(item.url);

  // reset img status when URL changes
  const prevUrl = useRef(item.url);
  if (prevUrl.current !== item.url) {
    prevUrl.current = item.url;
    setImgStatus("loading");
  }

  return (
    <div
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={cn(
        "group relative flex flex-col rounded-lg border bg-neutral-900 transition-all duration-150",
        isDragTarget
          ? "border-blue-500/70 bg-blue-950/30 scale-[1.005]"
          : isSelected
          ? "border-blue-400/50 bg-blue-950/10"
          : item.isPrimary
          ? "border-amber-500/50"
          : "border-neutral-700/60 hover:border-neutral-600"
      )}
    >
      {/* Primary badge */}
      {item.isPrimary && (
        <div className="absolute -top-2 left-3 flex items-center gap-1 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
          <Crown size={9} />
          PRIMARY
        </div>
      )}

      <div className="flex items-start gap-2 p-2">
        {/* Checkbox */}
        <div className="flex-shrink-0 mt-1 flex items-center gap-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(item.id, e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
            aria-label={`Select image ${index + 1}`}
          />
        </div>

        {/* Drag handle — draggable only via handle */}
        <div
          draggable
          onDragStart={() => onDragStart(index)}
          className="mt-1 cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0"
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </div>

        {/* Thumbnail preview */}
        <div
          className="relative flex-shrink-0 w-14 h-14 rounded-md bg-neutral-800 border border-neutral-700 overflow-hidden cursor-pointer"
          onClick={() => showPreview && setPreviewOpen(true)}
          title={showPreview ? "Click to preview" : "Enter a valid URL to preview"}
        >
          {showPreview ? (
            <>
              <img
                src={item.url}
                alt={`Gallery image ${index + 1}`}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  imgStatus === "ok" ? "opacity-100" : "opacity-0"
                )}
                onLoad={() => setImgStatus("ok")}
                onError={() => setImgStatus("fail")}
                referrerPolicy="no-referrer"
              />
              {imgStatus === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
              {imgStatus === "fail" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-950/40">
                  <ImageOff size={18} className="text-red-400" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600">
              <ImageOff size={18} />
            </div>
          )}

          {/* Index badge */}
          <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none bg-black/70 text-neutral-300 px-1 py-0.5 rounded font-mono">
            {index + 1}/{total}
          </span>
        </div>

        {/* URL input + actions */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={item.url}
            onChange={(e) => onUrlChange(item.id, e.target.value)}
            placeholder="/image.jpg or https://..."
            className={cn(
              "w-full bg-neutral-800 border rounded-md px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors font-mono",
              item.url && !isValidUrl(item.url)
                ? "border-red-500/60 focus:border-red-400"
                : "border-neutral-700 focus:border-blue-500/70"
            )}
          />

          {item.url && !isValidUrl(item.url) && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={10} />
              URL ไม่ถูกต้อง — ใช้ /path/image.jpg หรือ https://...
            </p>
          )}

          {/* Actions row */}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {item.url && isValidUrl(item.url) && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={10} className="text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={10} />
                      Copy
                    </>
                  )}
                </button>
                <span className="text-neutral-700 text-[10px]">·</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-blue-400 transition-colors"
                >
                  <ExternalLink size={10} />
                  Open
                </a>
                <span className="text-neutral-700 text-[10px]">·</span>
                {/* Set as primary */}
                {!item.isPrimary && (
                  <button
                    type="button"
                    onClick={() => onSetPrimary(item.id)}
                    className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-amber-400 transition-colors"
                    title="ตั้งเป็น cover / thumbnail หลัก"
                  >
                    <Crown size={10} />
                    Set Primary
                  </button>
                )}
                {item.isPrimary && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-400">
                    <Crown size={10} />
                    Primary
                  </span>
                )}
                <span className="text-neutral-700 text-[10px]">·</span>
                {/* Caption toggle */}
                <button
                  type="button"
                  onClick={() => setCaptionOpen((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-violet-400 transition-colors"
                >
                  <Pencil size={10} />
                  Caption
                  {captionOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                </button>
              </>
            )}
          </div>

          {/* Caption input (collapsible) */}
          {captionOpen && (
            <input
              type="text"
              value={item.caption}
              onChange={(e) => onCaptionChange(item.id, e.target.value)}
              placeholder="Caption สำหรับ lightbox (optional)"
              className="mt-2 w-full bg-neutral-800 border border-neutral-700 focus:border-violet-500/60 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none transition-colors"
            />
          )}
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 hover:text-red-400 hover:bg-red-950/40 transition-all"
          title="Remove image"
        >
          <X size={13} />
        </button>
      </div>

      {/* Full preview modal */}
      {previewOpen && showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative max-w-3xl max-h-[80vh] rounded-xl overflow-hidden shadow-2xl border border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={item.url}
              alt="Preview"
              className="w-full h-full object-contain max-h-[80vh]"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-2 text-xs text-neutral-400 font-mono truncate">
              {item.url}
              {item.caption && (
                <span className="ml-2 text-violet-300">— {item.caption}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-component: BulkImportPanel
// ─────────────────────────────────────────────
interface BulkImportPanelProps {
  onImport: (urls: string[]) => { added: number; skipped: number; invalid: number };
  maxImages: number;
  currentCount: number;
}

function BulkImportPanel({ onImport, maxImages, currentCount }: BulkImportPanelProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);
  const canAdd = maxImages - currentCount;

  // Live parse preview
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const validLines = lines.filter(isValidUrl);
  const invalidLines = lines.filter((l) => !isValidUrl(l));

  const handleImport = () => {
    if (validLines.length === 0) return;
    const r = onImport(validLines);
    setResult(r);
    // Clear textarea after successful import
    if (r.added > 0) setText("");
  };

  const handleClear = () => {
    setText("");
    setResult(null);
  };

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-950/10 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-950/20 border-b border-violet-500/20">
        <ClipboardList size={13} className="text-violet-400" />
        <span className="text-[11px] font-semibold text-violet-300 uppercase tracking-wider">
          Bulk Import
        </span>
        <span className="text-[10px] text-violet-500 ml-auto font-mono">
          1 link / บรรทัด — รับได้อีก {canAdd} รูป
        </span>
      </div>

      {/* Textarea */}
      <div className="p-3">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null); }}
          placeholder={"https://i.imgur.com/abc123.jpg\nhttps://cdn.example.com/photo1.jpg\nhttps://example.com/image2.png\n..."}
          rows={6}
          className="w-full bg-neutral-950 border border-neutral-700 focus:border-violet-500/60 rounded-md px-3 py-2.5 text-[12px] text-neutral-200 placeholder-neutral-700 outline-none transition-colors font-mono resize-y min-h-[120px]"
          spellCheck={false}
        />

        {/* Live parse stats */}
        {lines.length > 0 && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-neutral-500 font-mono">
              ทั้งหมด <span className="text-neutral-300">{lines.length}</span> บรรทัด
            </span>
            {validLines.length > 0 && (
              <span className="text-[11px] text-green-500 font-mono">
                ✓ valid <span className="text-green-300">{validLines.length}</span>
              </span>
            )}
            {invalidLines.length > 0 && (
              <span className="text-[11px] text-red-500 font-mono">
                ✗ invalid <span className="text-red-300">{invalidLines.length}</span>
              </span>
            )}
            {validLines.length > canAdd && (
              <span className="text-[11px] text-amber-500 font-mono">
                ⚠ รับได้แค่ {canAdd} รูปแรก
              </span>
            )}
          </div>
        )}

        {/* Invalid URL list (collapsible) */}
        {invalidLines.length > 0 && (
          <details className="mt-2">
            <summary className="text-[10px] text-red-500 cursor-pointer select-none hover:text-red-400">
              ดู {invalidLines.length} บรรทัดที่ไม่ถูกต้อง
            </summary>
            <pre className="mt-1 p-2 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-24">
              {invalidLines.join("\n")}
            </pre>
          </details>
        )}

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={validLines.length === 0 || canAdd === 0}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              "bg-violet-600 hover:bg-violet-500 text-white",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-violet-600",
              "shadow-[0_0_12px_rgba(139,92,246,0.3)]"
            )}
          >
            <Zap size={13} />
            บรรจุ {Math.min(validLines.length, canAdd)} รูป
          </button>

          {text && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <X size={11} />
              ล้าง
            </button>
          )}
        </div>

        {/* Import result feedback */}
        {result && (
          <div className={cn(
            "mt-2 px-3 py-2 rounded-md text-xs font-mono border",
            result.added > 0
              ? "bg-green-950/30 border-green-800/40 text-green-400"
              : "bg-neutral-900 border-neutral-700 text-neutral-500"
          )}>
            {result.added > 0 && `✓ เพิ่มแล้ว ${result.added} รูป`}
            {result.skipped > 0 && ` • ข้าม ${result.skipped} ซ้ำ`}
            {result.invalid > 0 && ` • invalid ${result.invalid}`}
            {result.added === 0 && "ไม่มีรูปใหม่ — ทุก URL ซ้ำหรือ invalid"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function GalleryUrlManager({
  label = "GALLERY IMAGES",
  value,
  onChange,
  initialImages,
  onImagesChange,
  maxImages = 20,
  placeholder = "/collection-thumb.jpg or https://...",
  className,
}: GalleryUrlManagerProps) {
  // Initialise from initialImages (new) or value (legacy string[])
  const [images, setImages] = useState<LocalImage[]>(() => {
    if (initialImages && initialImages.length > 0) {
      const sorted = [...initialImages].sort((a, b) => a.sort_order - b.sort_order);
      return sorted.map((img, idx) => ({
        id: img.id,
        url: img.url,
        caption: img.caption ?? "",
        isPrimary: idx === 0,
        status: "idle" as const,
      }));
    }
    return (value ?? []).map((url, idx) => ({
      id: uid(),
      url,
      caption: "",
      isPrimary: idx === 0,
      status: "idle" as const,
    }));
  });

  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const [showBulk, setShowBulk] = useState(false);

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Emit to parent(s) ──
  const emit = useCallback(
    (imgs: LocalImage[]) => {
      onChange?.(imgs.map((i) => i.url).filter(Boolean));
      onImagesChange?.(toGalleryImages(imgs));
    },
    [onChange, onImagesChange]
  );

  const update = (next: LocalImage[]) => {
    setImages(next);
    emit(next);
  };

  // ── Add single ──
  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;

    if (!isValidUrl(trimmed)) {
      setAddError("URL ไม่ถูกต้อง — ต้องขึ้นต้นด้วย / หรือ https://");
      return;
    }
    if (images.some((i) => i.url === trimmed)) {
      setAddError("URL นี้มีอยู่แล้ว");
      return;
    }
    if (images.length >= maxImages) {
      setAddError(`เพิ่มได้สูงสุด ${maxImages} รูป`);
      return;
    }

    const isFirst = images.length === 0;
    const next = [
      ...images,
      { id: uid(), url: trimmed, caption: "", isPrimary: isFirst, status: "idle" as const },
    ];
    update(next);
    setNewUrl("");
    setAddError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  // ── Bulk import (from BulkImportPanel) ──
  const handleBulkImport = (urls: string[]): { added: number; skipped: number; invalid: number } => {
    const dupes = new Set(images.map((i) => i.url));
    const canAdd = maxImages - images.length;

    const validUrls = urls.filter(isValidUrl);
    const invalidCount = urls.length - validUrls.length;
    const toAdd = validUrls.filter((u) => !dupes.has(u));
    const skippedCount = validUrls.length - toAdd.length;
    const batch = toAdd.slice(0, canAdd);

    if (batch.length === 0) {
      return { added: 0, skipped: skippedCount, invalid: invalidCount };
    }

    const isCurrentlyEmpty = images.length === 0;
    const newItems: LocalImage[] = batch.map((url, idx) => ({
      id: uid(),
      url,
      caption: "",
      isPrimary: isCurrentlyEmpty && idx === 0,
      status: "idle" as const,
    }));

    update([...images, ...newItems]);
    return { added: batch.length, skipped: skippedCount, invalid: invalidCount };
  };

  // ── Remove single ──
  const handleRemove = (id: string) => {
    const next = images.filter((i) => i.id !== id);
    // ensure primary always exists
    if (next.length > 0 && !next.some((i) => i.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    setSelected((s) => { const ns = new Set(s); ns.delete(id); return ns; });
    update(next);
  };

  // ── Bulk delete selected ──
  const handleBulkDelete = () => {
    const next = images.filter((i) => !selected.has(i.id));
    if (next.length > 0 && !next.some((i) => i.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    setSelected(new Set());
    update(next);
  };

  // ── Select ──
  const handleSelect = (id: string, checked: boolean) => {
    setSelected((s) => {
      const ns = new Set(s);
      if (checked) ns.add(id); else ns.delete(id);
      return ns;
    });
  };

  const handleSelectAll = () => {
    if (selected.size === images.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(images.map((i) => i.id)));
    }
  };

  // ── URL change inline ──
  const handleUrlChange = (id: string, url: string) => {
    update(images.map((i) => (i.id === id ? { ...i, url } : i)));
  };

  // ── Caption change ──
  const handleCaptionChange = (id: string, caption: string) => {
    update(images.map((i) => (i.id === id ? { ...i, caption } : i)));
  };

  // ── Set primary ──
  const handleSetPrimary = (id: string) => {
    const next = images.map((i) => ({ ...i, isPrimary: i.id === id }));
    // Move primary to front of array for clearer UX + sort_order 0
    const primaryIdx = next.findIndex((i) => i.id === id);
    if (primaryIdx > 0) {
      const [p] = next.splice(primaryIdx, 1);
      next.unshift(p);
    }
    update(next);
  };

  // ── Drag reorder (handle-initiated only) ──
  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragTarget(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === dropIndex) {
      setDragTarget(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(dropIndex, 0, moved);
    dragIndex.current = null;
    setDragTarget(null);
    update(next);
  };

  // ── Paste multi-URL (from single-line input) ──
  const handlePasteMulti = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const lines = text.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();

    const validLines = lines.filter(isValidUrl);
    const dupes = new Set(images.map((i) => i.url));
    const toAdd = validLines.filter((u) => !dupes.has(u));
    const canAdd = maxImages - images.length;

    if (toAdd.length > 0) {
      const isCurrentlyEmpty = images.length === 0;
      const newItems = toAdd.slice(0, canAdd).map((url, idx) => ({
        id: uid(),
        url,
        caption: "",
        isPrimary: isCurrentlyEmpty && idx === 0,
        status: "idle" as const,
      }));
      const next = [...images, ...newItems];
      update(next);
      setNewUrl("");
      setAddError(
        toAdd.length > canAdd ? `วาง ${toAdd.length} รูป แต่รับได้อีก ${canAdd} รูป` : ""
      );
    } else {
      setAddError("ไม่มี URL ที่ถูกต้องในข้อมูลที่วาง");
    }
  };

  const validCount = images.filter((i) => i.url && isValidUrl(i.url)).length;
  const allSelected = images.length > 0 && selected.size === images.length;
  const someSelected = selected.size > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
          {label}
        </label>
        <div className="flex items-center gap-3">
          {/* Bulk toggle button */}
          <button
            type="button"
            onClick={() => setShowBulk((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all",
              showBulk
                ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-violet-500/40 hover:text-violet-400"
            )}
            title="เปิด/ปิด Bulk Import — วางหลาย URL พร้อมกัน"
          >
            <ClipboardList size={11} />
            Bulk Import
          </button>
          <span className="text-[11px] text-neutral-600 font-mono">
            {validCount}/{maxImages}
          </span>
        </div>
      </div>

      {/* ── Bulk Import Panel ── */}
      {showBulk && (
        <BulkImportPanel
          onImport={handleBulkImport}
          maxImages={maxImages}
          currentCount={images.length}
        />
      )}

      {/* Input row (single URL) */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={newUrl}
            onChange={(e) => {
              setNewUrl(e.target.value);
              setAddError("");
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePasteMulti}
            placeholder={placeholder}
            disabled={images.length >= maxImages}
            className={cn(
              "w-full bg-neutral-900 border rounded-lg px-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors font-mono",
              addError
                ? "border-red-500/60 focus:border-red-400"
                : "border-neutral-700 focus:border-blue-500/60",
              images.length >= maxImages && "opacity-50 cursor-not-allowed"
            )}
          />
          {addError && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-400 absolute -bottom-5 left-0">
              <AlertCircle size={10} />
              {addError}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!newUrl.trim() || images.length >= maxImages}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            "bg-blue-600 hover:bg-blue-500 text-white",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          )}
          title="Add image (Enter)"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {/* Spacer for error */}
      {addError && <div className="h-4" />}

      {/* Hint */}
      <p className="text-[11px] text-neutral-600 -mt-1">
        Enter / Add • วางหลาย URL พร้อมกัน (newline หรือ comma) • ลาก handle เพื่อเรียงลำดับ • หรือกด <span className="text-violet-500">Bulk Import</span> เพื่อวางทีเดียว
      </p>

      {/* Bulk action bar — show when ≥1 selected */}
      {someSelected && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-950/40 border border-blue-500/30 rounded-lg">
          <span className="text-xs text-blue-300 font-medium">
            เลือก {selected.size} รูป
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors ml-auto"
          >
            <Trash2 size={12} />
            ลบที่เลือก
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {/* Image list */}
      {images.length > 0 && (
        <>
          {/* Select all toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              {allSelected ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {images.map((item, index) => (
              <ImagePreviewCard
                key={item.id}
                item={item}
                index={index}
                total={images.length}
                isSelected={selected.has(item.id)}
                onSelect={handleSelect}
                onRemove={handleRemove}
                onUrlChange={handleUrlChange}
                onCaptionChange={handleCaptionChange}
                onSetPrimary={handleSetPrimary}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragTarget={dragTarget === index}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {images.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-neutral-800 text-neutral-600">
          <ImageOff size={28} className="mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีรูปใน gallery</p>
          <p className="text-xs mt-1">เพิ่ม URL ด้านบน หรือใช้ Bulk Import</p>
        </div>
      )}

      {/* URL summary */}
      {images.length > 0 && (
        <details className="mt-1">
          <summary className="text-[11px] text-neutral-600 cursor-pointer hover:text-neutral-400 transition-colors select-none">
            ดู URL ทั้งหมด ({images.length} รูป)
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {images.map((i, idx) => `[${idx + 1}${i.isPrimary ? " ★" : ""}] ${i.url}${i.caption ? `  # ${i.caption}` : ""}`).join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
