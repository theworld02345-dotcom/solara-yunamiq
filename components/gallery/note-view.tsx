"use client"

/**
 * components/gallery/note-view.tsx — v3.0
 * Public read-only viewer — รองรับ HTML ทุก feature จาก note-editor v3:
 * รูปภาพ float / resize, SVG icons, blockquote, table, highlight
 */

import { useEffect, useRef } from "react"
import type { AnnouncementNote } from "@/lib/db"

interface NoteViewProps {
  note: AnnouncementNote | null
}

export function NoteView({ note }: NoteViewProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current && note?.content_html) {
      contentRef.current.innerHTML = note.content_html
    } else if (contentRef.current) {
      contentRef.current.innerHTML = ""
    }
  }, [note?.content_html])

  if (!note || !note.content_html) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground gap-3">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-30">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="15" x2="13" y2="15" />
        </svg>
        <p className="text-sm font-medium opacity-50">ยังไม่มีประกาศ</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="relative bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-transparent" />

        <div className="p-6 md:p-10">
          <div
            ref={contentRef}
            className="note-content max-w-none"
          />
        </div>

        <div className="px-6 md:px-10 pb-6 text-xs text-muted-foreground/50 text-right">
          อัปเดตเมื่อ {new Date(note.updated_at).toLocaleString("th-TH", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>

      {/* Scoped styles — รองรับทุก feature ของ editor v3 */}
      <style>{`
        .note-content { color: inherit; line-height: 1.75; font-size: 0.95rem; }
        .note-content h1 { font-size: 2em; font-weight: 800; margin: 0.6em 0 0.3em; line-height: 1.2; }
        .note-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.3em; line-height: 1.3; }
        .note-content h3 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0 0.2em; }
        .note-content h4 { font-size: 1em; font-weight: 600; margin: 0.3em 0 0.2em; }
        .note-content p  { margin: 0.4em 0; }
        .note-content ul { list-style: disc; padding-left: 1.6em; margin: 0.5em 0; }
        .note-content ol { list-style: decimal; padding-left: 1.6em; margin: 0.5em 0; }
        .note-content li { margin: 0.2em 0; }
        .note-content a  { color: #60a5fa; text-decoration: underline; text-underline-offset: 2px; }
        .note-content a:hover { color: #93c5fd; }
        .note-content hr { border: none; border-top: 2px solid rgba(255,255,255,0.12); margin: 1.2em 0; }
        .note-content img { max-width: 100%; border-radius: 8px; }
        .note-content blockquote {
          border-left: 3px solid #2563eb;
          margin: 1em 0;
          padding: 8px 16px;
          background: rgba(37,99,235,0.07);
          border-radius: 0 8px 8px 0;
          font-style: italic;
          color: inherit;
        }
        .note-content pre {
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px 16px;
          font-family: 'Courier New', monospace;
          font-size: 0.85em;
          white-space: pre-wrap;
          overflow-x: auto;
          margin: 0.75em 0;
        }
        .note-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
          font-size: 0.9em;
        }
        .note-content td, .note-content th {
          border: 1px solid rgba(255,255,255,0.12);
          padding: 8px 12px;
          vertical-align: top;
        }
        .note-content th {
          background: rgba(255,255,255,0.05);
          font-weight: 700;
          text-align: left;
        }
        .note-content svg {
          display: inline-block;
          vertical-align: middle;
        }
        /* clearfix for floated images */
        .note-content::after {
          content: "";
          display: table;
          clear: both;
        }
      `}</style>
    </div>
  )
}
