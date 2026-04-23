"use client"

/**
 * components/gallery/gallery-description-editor.tsx — Rich Description Editor for Gallery
 *
 * Features:
 * ─ Image insert + resize (25 / 50 / 75 / 100% หรือกำหนดเอง) + float left/right/center
 * ─ SVG Icon picker — 60+ icons หมวดหมู่
 * ─ Text highlight (background color)
 * ─ Font family picker (Serif / Mono / Display)
 * ─ Superscript / Subscript
 * ─ Blockquote insert
 * ─ Table insert (2x2 → 5x5)
 * ─ Emoji quick-insert panel
 * ─ Keyboard shortcuts: Ctrl+B/I/U/Z/Y, Ctrl+S to save
 */

import { useEffect, useRef, useState, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Panel = "image" | "link" | "icon" | "table" | "emoji" | null

// ─── SVG Icon Library ────────────────────────────────────────────────────────

const SVG_ICONS: Record<string, { label: string; path: string; viewBox?: string }[]> = {
  "⚡ Status": [
    { label: "Check", path: "M20 6L9 17l-5-5", viewBox: "0 0 24 24" },
    { label: "X Close", path: "M18 6L6 18M6 6l12 12", viewBox: "0 0 24 24" },
    { label: "Warning", path: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01", viewBox: "0 0 24 24" },
    { label: "Info", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8h.01M12 12v4", viewBox: "0 0 24 24" },
    { label: "Shield", path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", viewBox: "0 0 24 24" },
    { label: "Lock", path: "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4", viewBox: "0 0 24 24" },
  ],
  "🔥 Commerce": [
    { label: "Crown", path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", viewBox: "0 0 24 24" },
    { label: "Diamond", path: "M6 3h12l4 6-10 13L2 9z", viewBox: "0 0 24 24" },
    { label: "Gift", path: "M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z", viewBox: "0 0 24 24" },
    { label: "Tag", path: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01", viewBox: "0 0 24 24" },
    { label: "Zap", path: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", viewBox: "0 0 24 24" },
  ],
  "🎯 Media": [
    { label: "Image", path: "M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z", viewBox: "0 0 24 24" },
    { label: "Video", path: "M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1a2 2 0 01-2-2V7a2 2 0 012-2z", viewBox: "0 0 24 24" },
    { label: "Play", path: "M5 3l14 9-14 9V3z", viewBox: "0 0 24 24" },
    { label: "Camera", path: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z", viewBox: "0 0 24 24" },
  ],
  "🌐 Social": [
    { label: "Discord", path: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z", viewBox: "0 0 24 24" },
    { label: "Twitter/X", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z", viewBox: "0 0 24 24" },
    { label: "Link", path: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71", viewBox: "0 0 24 24" },
    { label: "Globe", path: "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z", viewBox: "0 0 24 24" },
  ],
  "➡️ Arrows": [
    { label: "Arrow Right", path: "M5 12h14M12 5l7 7-7 7", viewBox: "0 0 24 24" },
    { label: "Arrow Left",  path: "M19 12H5M12 19l-7-7 7-7", viewBox: "0 0 24 24" },
    { label: "Arrow Up",    path: "M12 19V5M5 12l7-7 7 7", viewBox: "0 0 24 24" },
    { label: "Arrow Down",  path: "M12 5v14M19 12l-7 7-7-7", viewBox: "0 0 24 24" },
    { label: "ChevronRight",path: "M9 18l6-6-6-6", viewBox: "0 0 24 24" },
    { label: "ChevronLeft", path: "M15 18l-6-6 6-6", viewBox: "0 0 24 24" },
  ],
  "💡 Misc": [
    { label: "Star",    path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", viewBox: "0 0 24 24" },
    { label: "Heart",   path: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z", viewBox: "0 0 24 24" },
    { label: "Fire",    path: "M12 23c4.97 0 9-3.582 9-8 0-1.79-.646-3.433-1.714-4.715-1.04-1.246-1.285-2.95-1.285-2.285 0 0-2.5 2-3.5 5-.5-1-.5-3.5-1.5-5.5C13 7.5 12 2 12 2S9.5 5 9.5 8.5c-.5-1.5-1-3.5-1-5.5C7.5 6 6.5 9 7 12c0 0-1.5-1-2.5-3.5C3.5 10 3 11.5 3 12.5c0 4.694 4.03 8.5 9 10.5z", viewBox: "0 0 24 24" },
    { label: "Bell",    path: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0", viewBox: "0 0 24 24" },
    { label: "Bookmark",path: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z", viewBox: "0 0 24 24" },
    { label: "Clock",   path: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2", viewBox: "0 0 24 24" },
    { label: "Send",    path: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z", viewBox: "0 0 24 24" },
  ],
}

const EMOJI_LIST = [
  "🔥","⭐","💎","👑","🎯","🚀","💡","✅","❌","⚠️",
  "🎁","💰","🔑","🏆","🎉","💫","🌟","⚡","🔔","📌",
  "👀","💪","🤝","🎮","📱","💻","🖼️","🎨","🧩","📊",
  "🔐","🌈","✨","🎵","📢","🔴","🟡","🟢","🔵","⚫",
]

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  "#ffffff","#f87171","#fb923c","#facc15",
  "#4ade80","#38bdf8","#a78bfa","#f472b6",
  "#94a3b8","#000000",
]

const HIGHLIGHT_PRESETS = [
  "#fef08a","#bbf7d0","#bfdbfe","#fde68a",
  "#fecaca","#e9d5ff","#00000000",
]

const SIZE_OPTIONS = [
  { label: "10px", value: "1" },
  { label: "13px", value: "2" },
  { label: "16px", value: "3" },
  { label: "18px", value: "4" },
  { label: "24px", value: "5" },
  { label: "32px", value: "6" },
  { label: "48px", value: "7" },
]

const HEADING_OPTIONS = [
  { tag: "H1",  label: "H1 — ใหญ่สุด" },
  { tag: "H2",  label: "H2 — รอง" },
  { tag: "H3",  label: "H3 — ย่อย" },
  { tag: "H4",  label: "H4 — เล็ก" },
  { tag: "DIV", label: "ข้อความปกติ" },
  { tag: "PRE", label: "Code block" },
] as const

const FONT_OPTIONS = [
  { label: "Default",  value: "inherit" },
  { label: "Serif",    value: "Georgia, serif" },
  { label: "Mono",     value: "'Courier New', monospace" },
  { label: "Thai",     value: "'Sarabun', 'Noto Sans Thai', sans-serif" },
]

const IMAGE_SIZES = ["25%", "50%", "75%", "100%", "px-custom"] as const

// ─── Helper: make SVG string from path ───────────────────────────────────────

function buildSvgHtml(
  pathData: string,
  viewBox = "0 0 24 24",
  size = 20,
  color = "currentColor"
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin:0 2px;"><path d="${pathData}" /></svg>`
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GalleryDescriptionEditorProps {
  initialHtml?: string | null
  onSave: (html: string, plainText: string) => Promise<void>
  onCancel?: () => void
  isSaving?: boolean
}

export function GalleryDescriptionEditor({
  initialHtml,
  onSave,
  onCancel,
  isSaving = false,
}: GalleryDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [charCount, setCharCount] = useState(0)
  const [activePanel, setActivePanel] = useState<Panel>(null)
  const [iconCategory, setIconCategory] = useState<string>(Object.keys(SVG_ICONS)[0])

  // Image panel state
  const [imageUrl, setImageUrl]     = useState("")
  const [imageSize, setImageSize]   = useState<string>("100%")
  const [imageCustomPx, setImageCustomPx] = useState("300")
  const [imageFloat, setImageFloat] = useState<"none" | "left" | "right">("none")

  // Icon panel state
  const [iconSize, setIconSize]     = useState(20)
  const [iconColor, setIconColor]   = useState("currentColor")

  // Link panel state
  const [linkUrl, setLinkUrl]       = useState("")
  const [linkText, setLinkText]     = useState("")

  // Table panel state
  const [tableRows, setTableRows]   = useState(2)
  const [tableCols, setTableCols]   = useState(2)

  // ── Load initial ────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml
      setCharCount(editorRef.current.innerText.length)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateCount = useCallback(() => {
    setCharCount(editorRef.current?.innerText.length ?? 0)
  }, [])

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    updateCount()
  }, [updateCount])

  const insertHtml = useCallback((html: string) => {
    editorRef.current?.focus()
    document.execCommand("insertHTML", false, html)
    updateCount()
  }, [updateCount])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    if (e.key === "s" || e.key === "S") {
      e.preventDefault()
      document.getElementById("gallery-desc-save-btn")?.click()
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard)
    return () => window.removeEventListener("keydown", handleKeyboard)
  }, [handleKeyboard])

  // ── Toggle panel ────────────────────────────────────────────────────────
  const togglePanel = (p: Panel) => setActivePanel(prev => prev === p ? null : p)

  // ── Insert image ────────────────────────────────────────────────────────
  const insertImage = () => {
    const url = imageUrl.trim()
    if (!url) return
    const width = imageSize === "px-custom" ? `${imageCustomPx}px` : imageSize
    const floatStyle = imageFloat !== "none"
      ? `float:${imageFloat};margin:${imageFloat === "left" ? "0 16px 8px 0" : "0 0 8px 16px"};`
      : "display:block;margin:8px auto;"
    insertHtml(
      `<img src="${url}" alt="" style="width:${width};max-width:100%;border-radius:8px;${floatStyle}" />`
      + (imageFloat !== "none" ? `<span style="display:block;clear:both;"></span>` : "")
    )
    setImageUrl("")
    setActivePanel(null)
  }

  // ── Insert SVG icon ─────────────────────────────────────────────────────
  const insertIcon = (pathData: string, viewBox: string) => {
    const svg = buildSvgHtml(pathData, viewBox, iconSize, iconColor)
    insertHtml(svg + "&nbsp;")
  }

  // ── Insert link ─────────────────────────────────────────────────────────
  const insertLink = () => {
    const url = linkUrl.trim()
    const text = linkText.trim() || url
    if (!url) return
    insertHtml(`<a href="${url}" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:underline;">${text}</a>`)
    setLinkUrl(""); setLinkText(""); setActivePanel(null)
  }

  // ── Insert table ─────────────────────────────────────────────────────────
  const insertTable = () => {
    const headerRow = `<tr>${Array.from({ length: tableCols }, (_, i) =>
      `<th style="border:1px solid rgba(255,255,255,0.15);padding:8px 12px;background:rgba(255,255,255,0.05);font-weight:700;">Col ${i + 1}</th>`
    ).join("")}</tr>`
    const bodyRows = Array.from({ length: tableRows - 1 }, () =>
      `<tr>${Array.from({ length: tableCols }, () =>
        `<td style="border:1px solid rgba(255,255,255,0.15);padding:8px 12px;">&nbsp;</td>`
      ).join("")}</tr>`
    ).join("")
    insertHtml(
      `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${headerRow}${bodyRows}</table><p><br></p>`
    )
    setActivePanel(null)
  }

  // ── Insert blockquote ────────────────────────────────────────────────────
  const insertBlockquote = () => {
    insertHtml(
      `<blockquote style="border-left:3px solid #2563eb;margin:12px 0;padding:8px 16px;background:rgba(37,99,235,0.07);border-radius:0 8px 8px 0;color:inherit;font-style:italic;">&nbsp;</blockquote><p><br></p>`
    )
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const html = editorRef.current?.innerHTML ?? ""
    const text = editorRef.current?.innerText ?? ""
    await onSave(html, text)
  }

  const btnCls = "px-2 py-1 text-xs rounded hover:bg-[#2a2a3e] text-[#8b8baa] hover:text-white transition-colors border border-transparent hover:border-[#3a3a5e] select-none cursor-pointer"
  const activeCls = "bg-[#2563eb]/20 text-[#60a5fa] border-[#2563eb]/30"

  return (
    <div className="flex flex-col gap-3">

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-2 flex flex-wrap items-center gap-1">

        {/* Heading */}
        <select onChange={(e) => exec("formatBlock", e.target.value)} defaultValue=""
          className="bg-[#111118] border border-[#1e1e2e] text-[#8b8baa] text-xs rounded px-2 py-1 cursor-pointer hover:border-[#2563eb]/50 outline-none">
          <option value="" disabled>หัวข้อ</option>
          {HEADING_OPTIONS.map(o => <option key={o.tag} value={o.tag}>{o.label}</option>)}
        </select>

        {/* Font size */}
        <select onChange={(e) => exec("fontSize", e.target.value)} defaultValue=""
          className="bg-[#111118] border border-[#1e1e2e] text-[#8b8baa] text-xs rounded px-2 py-1 cursor-pointer hover:border-[#2563eb]/50 outline-none">
          <option value="" disabled>ขนาด</option>
          {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Font family */}
        <select onChange={(e) => exec("fontName", e.target.value)} defaultValue=""
          className="bg-[#111118] border border-[#1e1e2e] text-[#8b8baa] text-xs rounded px-2 py-1 cursor-pointer hover:border-[#2563eb]/50 outline-none">
          <option value="" disabled>Font</option>
          {FONT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ fontFamily: o.value }}>{o.label}</option>)}
        </select>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Bold / Italic / Underline / Strike */}
        <button type="button" title="Bold (Ctrl+B)" onClick={() => exec("bold")}         className={`${btnCls} font-bold`}>B</button>
        <button type="button" title="Italic (Ctrl+I)" onClick={() => exec("italic")}       className={`${btnCls} italic`}>I</button>
        <button type="button" title="Underline (Ctrl+U)" onClick={() => exec("underline")}    className={`${btnCls} underline`}>U</button>
        <button type="button" title="Strikethrough" onClick={() => exec("strikeThrough")} className={`${btnCls} line-through`}>S</button>
        <button type="button" title="Superscript" onClick={() => exec("superscript")}  className={`${btnCls}`}>x<sup>2</sup></button>
        <button type="button" title="Subscript"   onClick={() => exec("subscript")}    className={`${btnCls}`}>x<sub>2</sub></button>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Align */}
        <button type="button" title="ชิดซ้าย"  onClick={() => exec("justifyLeft")}   className={btnCls}>L</button>
        <button type="button" title="กึ่งกลาง" onClick={() => exec("justifyCenter")} className={btnCls}>C</button>
        <button type="button" title="ชิดขวา"   onClick={() => exec("justifyRight")}  className={btnCls}>R</button>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Lists */}
        <button type="button" title="Bullet list"  onClick={() => exec("insertUnorderedList")} className={btnCls}>&#8226;</button>
        <button type="button" title="Ordered list" onClick={() => exec("insertOrderedList")}   className={btnCls}>1.</button>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Text color */}
        <div className="flex items-center gap-0.5" title="สีตัวอักษร">
          {COLOR_PRESETS.slice(0, 6).map(c => (
            <button key={c} type="button" title={`สี ${c}`} onClick={() => exec("foreColor", c)}
              style={{ backgroundColor: c }}
              className="size-4 rounded-sm border border-white/10 hover:scale-110 transition-transform cursor-pointer" />
          ))}
        </div>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Highlight color */}
        <span className="text-[10px] text-[#4a4a6a] select-none">HL:</span>
        <div className="flex items-center gap-0.5">
          {HIGHLIGHT_PRESETS.slice(0, 4).map(c => (
            <button key={c} type="button" title={`Highlight ${c}`}
              onClick={() => exec("hiliteColor", c === "#00000000" ? "transparent" : c)}
              style={{ backgroundColor: c === "#00000000" ? "transparent" : c, border: c === "#00000000" ? "1px dashed #4a4a6a" : "1px solid rgba(255,255,255,0.1)" }}
              className="size-4 rounded-sm hover:scale-110 transition-transform cursor-pointer" />
          ))}
        </div>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Special inserts */}
        <button type="button" title="เส้นคั่น (HR)"
          onClick={() => insertHtml("<hr style='border:none;border-top:2px solid rgba(255,255,255,0.15);margin:1em 0;' />")}
          className={btnCls}>&#9135;</button>

        <button type="button" title="Blockquote"
          onClick={insertBlockquote}
          className={btnCls}>&#10077;</button>

        <button type="button" title="แทรกรูปภาพ"
          onClick={() => togglePanel("image")}
          className={`${btnCls} ${activePanel === "image" ? activeCls : ""}`}>IMG</button>

        <button type="button" title="แทรกลิงก์"
          onClick={() => togglePanel("link")}
          className={`${btnCls} ${activePanel === "link" ? activeCls : ""}`}>URL</button>

        <button type="button" title="แทรก SVG Icon"
          onClick={() => togglePanel("icon")}
          className={`${btnCls} ${activePanel === "icon" ? activeCls : ""}`}>ICON</button>

        <button type="button" title="แทรก Emoji"
          onClick={() => togglePanel("emoji")}
          className={`${btnCls} ${activePanel === "emoji" ? activeCls : ""}`}>EMJ</button>

        <button type="button" title="แทรกตาราง"
          onClick={() => togglePanel("table")}
          className={`${btnCls} ${activePanel === "table" ? activeCls : ""}`}>TBL</button>

        <div className="w-px h-5 bg-[#1e1e2e] mx-0.5" />

        {/* Undo / Redo */}
        <button type="button" title="ย้อนกลับ (Ctrl+Z)" onClick={() => exec("undo")} className={btnCls}>&#8617;</button>
        <button type="button" title="ทำซ้ำ (Ctrl+Y)"    onClick={() => exec("redo")} className={btnCls}>&#8618;</button>

        {/* Remove format */}
        <button type="button" title="ล้าง format" onClick={() => exec("removeFormat")} className={btnCls}>CLR</button>
      </div>

      {/* ── IMAGE PANEL ─────────────────────────────────────────────────── */}
      {activePanel === "image" && (
        <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[11px] text-[#4a4a6a] font-bold uppercase tracking-widest">แทรกรูปภาพ</p>
          <input type="url" placeholder="URL รูปภาพ (https://...)"
            value={imageUrl} onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && insertImage()}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#2563eb]/60" />

          {/* Size picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[#4a4a6a]">ขนาด:</span>
            {IMAGE_SIZES.filter(s => s !== "px-custom").map(s => (
              <button key={s} type="button"
                onClick={() => setImageSize(s)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${imageSize === s ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                {s}
              </button>
            ))}
            <button type="button"
              onClick={() => setImageSize("px-custom")}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${imageSize === "px-custom" ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
              กำหนดเอง
            </button>
            {imageSize === "px-custom" && (
              <input type="number" value={imageCustomPx} onChange={e => setImageCustomPx(e.target.value)}
                className="w-20 bg-[#111118] border border-[#1e1e2e] rounded px-2 py-0.5 text-xs text-white outline-none focus:border-blue-600/60"
                placeholder="px" />
            )}
          </div>

          {/* Float picker */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#4a4a6a]">ตำแหน่ง:</span>
            {(["none", "left", "right"] as const).map(f => (
              <button key={f} type="button"
                onClick={() => setImageFloat(f)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${imageFloat === f ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                {f === "none" ? "กึ่งกลาง" : f === "left" ? "ซ้าย" : "ขวา"}
              </button>
            ))}
          </div>

          {/* Preview */}
          {imageUrl && (
            <div className="rounded-lg overflow-hidden border border-[#1e1e2e] max-h-40 flex items-center justify-center bg-[#06060d]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="preview"
                style={{ width: imageSize === "px-custom" ? `${imageCustomPx}px` : imageSize, maxWidth: "100%", maxHeight: "160px", objectFit: "contain" }} />
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={insertImage}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors">แทรกรูป</button>
            <button type="button" onClick={() => setActivePanel(null)}
              className="px-3 py-1.5 text-[#6b6b8a] hover:text-white text-sm rounded-lg transition-colors">ปิด</button>
          </div>
        </div>
      )}

      {/* ── LINK PANEL ──────────────────────────────────────────────────── */}
      {activePanel === "link" && (
        <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[11px] text-[#4a4a6a] font-bold uppercase tracking-widest">แทรกลิงก์</p>
          <div className="flex gap-2 flex-wrap">
            <input type="text" placeholder="ข้อความลิงก์"
              value={linkText} onChange={e => setLinkText(e.target.value)}
              className="flex-1 min-w-[140px] bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#2563eb]/60" />
            <input type="url" placeholder="URL (https://...)"
              value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && insertLink()}
              className="flex-1 min-w-[200px] bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#2563eb]/60" />
            <button type="button" onClick={insertLink}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors">แทรก</button>
            <button type="button" onClick={() => setActivePanel(null)}
              className="px-3 py-1.5 text-[#6b6b8a] hover:text-white text-sm rounded-lg transition-colors">ปิด</button>
          </div>
        </div>
      )}

      {/* ── ICON PANEL ──────────────────────────────────────────────────── */}
      {activePanel === "icon" && (
        <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[#4a4a6a] font-bold uppercase tracking-widest">SVG Icon Library</p>
            <button type="button" onClick={() => setActivePanel(null)} className="text-[#4a4a6a] hover:text-white text-sm">ปิด</button>
          </div>

          {/* Icon options */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#4a4a6a]">ขนาด:</span>
              {[14, 18, 20, 24, 32].map(s => (
                <button key={s} type="button" onClick={() => setIconSize(s)}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${iconSize === s ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[#4a4a6a]">สี:</span>
              {["currentColor", "#ffffff", "#f87171", "#60a5fa", "#4ade80", "#facc15"].map(c => (
                <button key={c} type="button" onClick={() => setIconColor(c)}
                  style={{ background: c === "currentColor" ? "linear-gradient(135deg,#fff 50%,#888 50%)" : c, border: iconColor === c ? "2px solid #2563eb" : "1px solid rgba(255,255,255,0.1)" }}
                  className="size-5 rounded-sm hover:scale-110 transition-transform" />
              ))}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 flex-wrap">
            {Object.keys(SVG_ICONS).map(cat => (
              <button key={cat} type="button" onClick={() => setIconCategory(cat)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${iconCategory === cat ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Icon grid */}
          <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#1e1e2e]">
            {SVG_ICONS[iconCategory]?.map(icon => (
              <button key={icon.label} type="button"
                onClick={() => insertIcon(icon.path, icon.viewBox ?? "0 0 24 24")}
                title={icon.label}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-transparent hover:bg-[#1e1e2e] hover:border-[#2a2a3e] transition-all group">
                <svg width={iconSize > 28 ? 28 : iconSize} height={iconSize > 28 ? 28 : iconSize}
                  viewBox={icon.viewBox ?? "0 0 24 24"}
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-[#8b8baa] group-hover:text-white transition-colors">
                  <path d={icon.path} />
                </svg>
                <span className="text-[8px] text-[#4a4a6a] group-hover:text-[#8b8baa] leading-tight text-center">{icon.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── EMOJI PANEL ─────────────────────────────────────────────────── */}
      {activePanel === "emoji" && (
        <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-[#4a4a6a] font-bold uppercase tracking-widest">Emoji</p>
            <button type="button" onClick={() => setActivePanel(null)} className="text-[#4a4a6a] hover:text-white text-sm">ปิด</button>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {EMOJI_LIST.map(em => (
              <button key={em} type="button"
                onClick={() => { insertHtml(em); }}
                className="text-xl hover:bg-[#1e1e2e] rounded-lg p-1.5 transition-colors hover:scale-110">
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── TABLE PANEL ─────────────────────────────────────────────────── */}
      {activePanel === "table" && (
        <div className="bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[#4a4a6a] font-bold uppercase tracking-widest">แทรกตาราง</p>
            <button type="button" onClick={() => setActivePanel(null)} className="text-[#4a4a6a] hover:text-white text-sm">ปิด</button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6b6b8a]">แถว:</span>
              {[2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setTableRows(n)}
                  className={`w-8 h-8 rounded border text-xs transition-colors ${tableRows === n ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6b6b8a]">คอลัมน์:</span>
              {[2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setTableCols(n)}
                  className={`w-8 h-8 rounded border text-xs transition-colors ${tableCols === n ? "border-blue-600 text-blue-400 bg-blue-600/10" : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#3a3a5e]"}`}>
                  {n}
                </button>
              ))}
            </div>
            <button type="button" onClick={insertTable}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors">
              สร้างตาราง {tableRows}x{tableCols}
            </button>
          </div>
        </div>
      )}

      {/* ── EDITOR CANVAS ────────────────────────────────────────────────── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={updateCount}
        spellCheck={false}
        className="min-h-[200px] max-h-[400px] bg-[#0d0d15] border border-[#1e1e2e] rounded-xl p-4 text-white outline-none focus:border-[#2563eb]/40 overflow-y-auto leading-relaxed text-sm gallery-desc-editor-canvas"
        style={{ whiteSpace: "pre-wrap" }}
        data-placeholder="เขียนรายละเอียด gallery ที่นี่..."
      />

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#4a4a6a]">{charCount.toLocaleString()} ตัวอักษร</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-[#6b6b8a] hover:text-white border border-[#1e1e2e] hover:border-[#3a3a5e] rounded-xl transition-colors">
              ยกเลิก
            </button>
          )}
          <button type="button"
            onClick={() => { if (editorRef.current) { editorRef.current.innerHTML = ""; setCharCount(0) } }}
            className="px-4 py-2 text-sm text-[#6b6b8a] hover:text-red-400 border border-[#1e1e2e] hover:border-red-500/30 rounded-xl transition-colors">
            ล้างทั้งหมด
          </button>
          <button id="gallery-desc-save-btn" type="button"
            onClick={handleSave} disabled={isSaving}
            className="px-6 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-colors">
            {isSaving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      <style>{`
        .gallery-desc-editor-canvas:empty:before {
          content: attr(data-placeholder);
          color: #4a4a6a;
          pointer-events: none;
        }
        .gallery-desc-editor-canvas h1 { font-size: 1.75em; font-weight: 800; margin: 0.4em 0; }
        .gallery-desc-editor-canvas h2 { font-size: 1.4em; font-weight: 700; margin: 0.4em 0; }
        .gallery-desc-editor-canvas h3 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0; }
        .gallery-desc-editor-canvas h4 { font-size: 1em; font-weight: 600; margin: 0.3em 0; }
        .gallery-desc-editor-canvas pre { background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; }
        .gallery-desc-editor-canvas ul { list-style: disc; padding-left: 1.5em; }
        .gallery-desc-editor-canvas ol { list-style: decimal; padding-left: 1.5em; }
        .gallery-desc-editor-canvas a { text-decoration: underline; color: #60a5fa; }
        .gallery-desc-editor-canvas img { max-width: 100%; border-radius: 8px; }
        .gallery-desc-editor-canvas hr { border: none; border-top: 2px solid rgba(255,255,255,0.15); margin: 1em 0; }
        .gallery-desc-editor-canvas blockquote { border-left: 3px solid #2563eb; margin: 12px 0; padding: 8px 16px; background: rgba(37,99,235,0.07); border-radius: 0 8px 8px 0; font-style: italic; }
        .gallery-desc-editor-canvas table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .gallery-desc-editor-canvas td, .gallery-desc-editor-canvas th { border: 1px solid rgba(255,255,255,0.15); padding: 8px 12px; }
        .gallery-desc-editor-canvas th { background: rgba(255,255,255,0.05); font-weight: 700; }
        .gallery-desc-editor-canvas svg { display: inline-block; vertical-align: middle; }
      `}</style>
    </div>
  )
}
