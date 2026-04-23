"use client"

// ============================================================
// components/admin/admin-shell.tsx
// ✅ v4.3 — Fix Card style prop + useCallback + listScrollRef
//   • Sidebar navigation (replaces horizontal tab bar)
//   • Design token CSS variables (replaces scattered hex literals)
//   • KPI cards with trend indicators
//   • Keyboard shortcuts (G/U/T/A/N/B/D/+)
//   • System status indicator in sidebar footer
//   • Collapsible sidebar on mobile
// ============================================================

import React, { useState, useTransition, useRef, useEffect, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useRouter } from "next/navigation"
import type { AppUser, Gallery, Tag, SessionUser } from "@/lib/types"
import { getGalleryThumbnail } from "@/lib/types"
import type { AnnouncementBanner, AnnouncementNote } from "@/lib/db"
import {
  adminBanUser,
  adminUnbanUser,
  adminForceRoleSync,
  adminCreateGallery,
  adminUpdateGallery,
  adminDeleteGallery,
  adminBulkToggleGalleries,
  adminBulkDeleteGalleries,
  adminAddLink,
  adminUpdateLink,
  adminDeleteLink,
  adminCreateTag,
  adminUpdateTag,
  adminDeleteTag,
  adminSetAnnouncement,
  adminCreateBackup,
  adminResetStats,
  adminSaveNote,
} from "@/app/admin/actions"
import { NoteEditor } from "@/components/admin/note-editor"
import { ThumbnailUrlManager } from "./ThumbnailUrlManager"

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Centralized so changes propagate everywhere
const C = {
  bg:        "#08080e",
  surface:   "#0f0f17",
  surfaceHi: "#151521",
  border:    "#1c1c2e",
  borderHi:  "#252538",
  muted:     "#3a3a55",
  dim:       "#5a5a78",
  text:      "#e2e2f0",
  textSub:   "#8888aa",
  blue:      "#3b82f6",
  blueL:     "#60a5fa",
  blueDim:   "#1e3a5f",
  green:     "#22c55e",
  greenDim:  "#0d2e1a",
  red:       "#ef4444",
  redDim:    "#2e0d0d",
  amber:     "#f59e0b",
  amberDim:  "#2e1e0a",
  violet:    "#8b5cf6",
  violetDim: "#1e1040",
} as const

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stats {
  totalUsers: number
  bannedUsers: number
  totalGalleries: number
  activeGalleries: number
  totalLinks: number
  totalViews: number
  totalCopies: number
  totalTags: number
  activeTags: number
}

interface Props {
  session: SessionUser
  users: AppUser[]
  galleries: Gallery[]
  tags: Tag[]
  stats: Stats
  announcement: AnnouncementBanner | null
  note: AnnouncementNote | null
}

type Tab = "overview" | "galleries" | "users" | "tags" | "announcement" | "note" | "backup" | "digital" | "adduser"
type SortField = "title" | "views" | "copies" | "rate" | "links" | "created"
type SortDir = "asc" | "desc"

const ROLES = ["69Bath", "99Bath", "199Bath", "299Bath", "699Bath"] as const
const ROLE_LEVELS: Record<string, number> = {
  "69Bath": 1, "99Bath": 2, "199Bath": 3, "299Bath": 4, "699Bath": 5,
}
const ROLE_COLORS: Record<string, string> = {
  "69Bath": "#6b7280", "99Bath": "#3b82f6", "199Bath": "#8b5cf6", "299Bath": "#f59e0b", "699Bath": "#ef4444",
}

// ─── Sidebar Nav Config ───────────────────────────────────────────────────────
const NAV_ITEMS: { id: Tab; label: string; icon: string; shortcut: string; badge?: (p: Props) => React.ReactNode }[] = [
  { id: "overview",     label: "Overview",      icon: "▣",  shortcut: "O" },
  { id: "galleries",   label: "Galleries",     icon: "⊞",  shortcut: "G",
    badge: (p) => p.stats.totalGalleries > 0 ? <NavBadge>{p.stats.totalGalleries}</NavBadge> : null },
  { id: "users",       label: "Users",         icon: "◉",  shortcut: "U",
    badge: (p) => p.stats.bannedUsers > 0 ? <NavBadge variant="red">{p.stats.bannedUsers}</NavBadge> : null },
  { id: "tags",        label: "Tags",          icon: "#",  shortcut: "T",
    badge: (p) => p.stats.activeTags > 0 ? <NavBadge>{p.stats.activeTags}</NavBadge> : null },
  { id: "announcement",label: "Announcement",  icon: "◈",  shortcut: "A",
    badge: (p) => p.announcement ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> : null },
  { id: "note",        label: "Note",          icon: "≡",  shortcut: "N",
    badge: (p) => p.note ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> : null },
  { id: "backup",      label: "Backup",        icon: "⊗",  shortcut: "B" },
  { id: "digital",     label: "Digital Override", icon: "⚡", shortcut: "D" },
  { id: "adduser",     label: "Add User",      icon: "+",  shortcut: "P" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function NavBadge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "red" }) {
  const colors = variant === "red"
    ? "bg-red-900/60 text-red-400"
    : "bg-white/10 text-white/50"
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colors}`}>
      {children}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      style={{ backgroundColor: ROLE_COLORS[role] + "20", color: ROLE_COLORS[role], borderColor: ROLE_COLORS[role] + "40" }}
      className="text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap"
    >
      {role}
    </span>
  )
}

// KPI card with optional trend arrow
function KpiCard({
  label, value, sub, accent = "text-white", trend, icon,
}: {
  label: string; value: number | string; sub?: string
  accent?: string; trend?: "up" | "down" | "neutral"; icon?: string
}) {
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-zinc-500"
  const trendIcon  = trend === "up" ? "↑" : trend === "down" ? "↓" : "—"
  return (
    <div
      style={{ backgroundColor: C.surface, borderColor: C.border }}
      className="border rounded-2xl p-5 hover:border-[#252538] transition-all group relative overflow-hidden"
    >
      {/* subtle gradient glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.04) 0%, transparent 70%)" }} />
      <div className="flex items-start justify-between mb-3">
        {icon && <span className="text-xl opacity-40">{icon}</span>}
        {trend && (
          <span className={`text-xs font-bold ${trendColor}`}>{trendIcon}</span>
        )}
      </div>
      <div className={`text-3xl font-black tracking-tight ${accent}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{ color: C.dim }} className="text-[10px] font-semibold uppercase tracking-widest mt-2">{label}</div>
      {sub && <div style={{ color: C.muted }} className="text-[10px] mt-0.5">{sub}</div>}
    </div>
  )
}

// Inline section heading
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 style={{ color: C.textSub }} className="text-[10px] font-bold uppercase tracking-widest">{children}</h3>
      {action}
    </div>
  )
}

// Surface card wrapper
function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ backgroundColor: C.surface, borderColor: C.border, ...style }} className={`border rounded-2xl ${className}`}>
      {children}
    </div>
  )
}

// Text input
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text } as React.CSSProperties}
      className={`border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#3b82f6] placeholder:text-[#3a3a55] ${className}`}
      {...props}
    />
  )
}

// Textarea
function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text } as React.CSSProperties}
      className={`border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#3b82f6] resize-none placeholder:text-[#3a3a55] ${className}`}
      {...props}
    />
  )
}

// Field label
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ color: C.dim }} className="text-[10px] font-bold uppercase tracking-widest block mb-1.5">{children}</label>
}

// Primary button
function PrimaryBtn({ children, onClick, disabled, className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors ${className}`}
    >{children}</button>
  )
}

// Ghost button
function GhostBtn({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      style={{ color: C.textSub, borderColor: C.border } as React.CSSProperties}
      className={`px-3 py-2 border rounded-xl text-sm hover:text-white hover:border-[#252538] transition-colors ${className}`}
    >{children}</button>
  )
}

// Toggle switch
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-[#1c1c2e]"}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span style={{ color: C.text }} className="text-sm">{label}</span>
    </label>
  )
}

// Status pill
function StatusPill({ active, activeLabel = "Active", inactiveLabel = "Inactive" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
      active ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/40"
              : "bg-red-900/30 text-red-400 border border-red-800/30"
    }`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  )
}

// Inline action button
function ActionBtn({ children, onClick, variant = "default", disabled }: {
  children: React.ReactNode; onClick?: () => void
  variant?: "default" | "blue" | "green" | "red" | "orange"; disabled?: boolean
}) {
  const colors = {
    default: "bg-white/5 hover:bg-white/10 text-white/50 hover:text-white",
    blue:    "bg-blue-900/30 hover:bg-blue-900/60 text-blue-400",
    green:   "bg-emerald-900/30 hover:bg-emerald-900/60 text-emerald-400",
    red:     "bg-red-900/20 hover:bg-red-900/50 text-red-400",
    orange:  "bg-orange-900/20 hover:bg-orange-900/40 text-orange-400",
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-[10px] font-semibold rounded-lg transition-colors disabled:opacity-40 ${colors[variant]}`}
    >{children}</button>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
interface ConfirmDialogProps {
  title: string; message: string
  confirmLabel?: string; cancelLabel?: string
  danger?: boolean
  onConfirm: () => void; onCancel: () => void
  withInput?: { label: string; placeholder: string; onValue: (v: string) => void }
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel, withInput }: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("")
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onCancel}>
      <div style={{ backgroundColor: C.surface, borderColor: C.borderHi }} className="border rounded-2xl w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-3">
          <div style={{ color: C.text }} className="text-base font-bold">{title}</div>
          <div style={{ color: C.textSub }} className="text-sm">{message}</div>
          {withInput && (
            <div className="mt-3">
              <Label>{withInput.label}</Label>
              <Input
                autoFocus
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); withInput.onValue(e.target.value) }}
                placeholder={withInput.placeholder}
                className="w-full"
              />
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <GhostBtn onClick={onCancel} className="flex-1 justify-center">{cancelLabel}</GhostBtn>
          <button
            onClick={onConfirm}
            disabled={withInput !== undefined && inputValue.trim() === ""}
            className={`flex-1 px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 ${
              danger ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── CSV Export Helper ────────────────────────────────────────────────────────
function exportGalleriesToCSV(galleries: Gallery[], tags: Tag[]) {
  const tagMap = Object.fromEntries(tags.map(t => [t.id, t.display]))
  const rows = [
    ["ID", "Title", "Status", "Pinned", "Min Role", "Views", "Copies", "Copy Rate %", "Links", "Tags", "Created"],
    ...galleries.map(g => {
      const rate = g.stats.total_views > 0
        ? ((g.stats.total_copies / g.stats.total_views) * 100).toFixed(1)
        : "0.0"
      return [
        g.id,
        `"${g.title.replace(/"/g, '""')}"`,
        g.is_active ? "active" : "inactive",
        g.is_pinned ? "yes" : "no",
        g.access.min_role_name,
        g.stats.total_views,
        g.stats.total_copies,
        rate,
        g.links.length,
        `"${g.tags.map(tid => tagMap[tid] ?? tid).join(", ")}"`,
        new Date(g.uploaded_at).toLocaleDateString("th-TH"),
      ]
    })
  ]
  const csv = rows.map(r => r.join(",")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url
  a.download = `galleries_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
export function AdminShell({ session, users, galleries, tags, stats, announcement, note }: Props) {
  const [tab, setTab] = useState<Tab>("overview")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)
  const router = useRouter()
  const props: Props = { session, users, galleries, tags, stats, announcement, note }

  function notify(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function run(fn: () => Promise<{ ok: boolean }>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn()
        notify(successMsg)
        router.refresh()
      } catch (e) { notify((e as Error).message, "err") }
    })
  }

  const conversionRate = stats.totalViews > 0 ? ((stats.totalCopies / stats.totalViews) * 100).toFixed(1) : "0.0"

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const item = NAV_ITEMS.find(n => n.shortcut === e.key.toUpperCase())
      if (item) setTab(item.id)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div style={{ backgroundColor: C.bg, color: C.text }} className="min-h-screen flex font-sans">

      {/* ── SIDEBAR ── */}
      <aside
        style={{ backgroundColor: C.surface, borderColor: C.border }}
        className={`flex-shrink-0 border-r flex flex-col transition-all duration-200 sticky top-0 h-screen ${
          sidebarOpen ? "w-56" : "w-14"
        }`}
      >
        {/* Logo */}
        <div style={{ borderColor: C.border }} className="border-b px-4 py-4 flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[11px] font-black shrink-0">S</div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div style={{ color: C.text }} className="text-sm font-bold leading-none truncate">Solara</div>
              <div style={{ color: C.dim }} className="text-[9px] mt-0.5 truncate">Admin Panel</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ color: C.muted }}
            className="ml-auto hover:text-white transition-colors shrink-0 text-xs"
            title={sidebarOpen ? "Collapse" : "Expand"}
          >
            {sidebarOpen ? "◂" : "▸"}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                title={`${item.label} (${item.shortcut})`}
                style={{
                  backgroundColor: active ? C.blueDim : "transparent",
                  color: active ? C.blueL : C.dim,
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all hover:text-white ${
                  active ? "" : "hover:bg-white/5"
                }`}
              >
                <span className="text-base leading-none w-5 text-center shrink-0">{item.icon}</span>
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge?.(props)}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        {sidebarOpen && (
          <div style={{ borderColor: C.border }} className="border-t px-3 py-3 space-y-2 shrink-0">
            {/* System status */}
            <div className="flex items-center gap-2 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span style={{ color: C.dim }} className="text-[9px]">System Online</span>
            </div>
            {isPending && (
              <div className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <span style={{ color: C.dim }} className="text-[9px]">Saving…</span>
              </div>
            )}
            {/* User info */}
            <div style={{ borderColor: C.border }} className="border rounded-xl px-2.5 py-2 flex items-center gap-2">
              <img src={session.avatar ?? "/placeholder-user.jpg"} className="w-6 h-6 rounded-full shrink-0" alt="" />
              <div className="min-w-0">
                <div style={{ color: C.text }} className="text-[10px] font-semibold truncate">{session.discord_tag}</div>
                <div style={{ color: C.dim }} className="text-[9px]">Owner</div>
              </div>
            </div>
            <a href="/" style={{ color: C.dim }} className="flex items-center gap-1.5 px-1 text-[10px] hover:text-white transition-colors">
              ← View site
            </a>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-w-0 overflow-y-auto">

        {/* Top bar */}
        <div style={{ backgroundColor: C.surface + "cc", borderColor: C.border }} className="border-b px-6 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
          <div>
            <h1 style={{ color: C.text }} className="text-sm font-bold leading-none">
              {NAV_ITEMS.find(n => n.id === tab)?.icon} {NAV_ITEMS.find(n => n.id === tab)?.label}
            </h1>
            <p style={{ color: C.dim }} className="text-[10px] mt-0.5">
              {tab === "overview" && `${stats.totalGalleries} galleries · ${stats.totalUsers} users`}
              {tab === "galleries" && `${stats.activeGalleries} active of ${stats.totalGalleries}`}
              {tab === "users" && `${stats.totalUsers - stats.bannedUsers} active · ${stats.bannedUsers} banned`}
              {tab === "tags" && `${stats.activeTags} active of ${stats.totalTags}`}
              {tab === "backup" && "Database & link health"}
              {tab === "digital" && "Temporary role overrides"}
              {tab === "adduser" && "Manually register users"}
              {tab === "announcement" && "Public announcement banner"}
              {tab === "note" && "Internal admin notes"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: C.muted }} className="text-[9px] hidden lg:block">
              Press key to navigate: {NAV_ITEMS.map(n => n.shortcut).join(" · ")}
            </span>
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-7">
          {tab === "overview"     && <OverviewTab stats={stats} galleries={galleries} users={users} conversionRate={conversionRate} />}
          {tab === "galleries"    && <GalleriesTab galleries={galleries} tags={tags} run={run} notify={notify} isPending={isPending} />}
          {tab === "users"        && <UsersTab users={users} run={run} notify={notify} />}
          {tab === "tags"         && <TagsTab tags={tags} run={run} notify={notify} session={session} />}
          {tab === "announcement" && <AnnouncementTab current={announcement} run={run} />}
          {tab === "note"         && <NoteEditor initialNote={note} />}
          {tab === "backup"       && <BackupTab notify={notify} galleries={galleries} run={run} />}
          {tab === "digital"      && <DigitalOverrideTab session={session} notify={notify} />}
          {tab === "adduser"      && <AddUserTab notify={notify} />}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 ${
          toast.type === "ok"
            ? "bg-emerald-950/90 border-emerald-700/60 text-emerald-300"
            : "bg-red-950/90 border-red-700/60 text-red-300"
        }`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
            toast.type === "ok" ? "bg-emerald-600" : "bg-red-600"
          }`}>{toast.type === "ok" ? "✓" : "✗"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ stats, galleries, users, conversionRate }: { stats: Stats; galleries: Gallery[]; users: AppUser[]; conversionRate: string }) {
  const topGalleries = [...galleries].sort((a, b) => b.stats.total_views - a.stats.total_views).slice(0, 5)
  const recentUsers  = [...users].sort((a, b) => new Date(b.last_login).getTime() - new Date(a.last_login).getTime()).slice(0, 6)
  const allAudit = users
    .flatMap((u) => u.audit_log.map((e) => ({ ...e, user: u })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15)

  const convNum = parseFloat(conversionRate)

  return (
    <div className="space-y-7">

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon="◉" label="Users"      value={stats.totalUsers}     sub={`${stats.bannedUsers} banned`}
          accent={C.text} trend="neutral" />
        <KpiCard icon="⊞" label="Galleries"  value={stats.totalGalleries} sub={`${stats.activeGalleries} active`}
          accent="text-blue-400" trend="neutral" />
        <KpiCard icon="⊗" label="Links"      value={stats.totalLinks}     sub="across all galleries"
          accent={C.text} trend="neutral" />
        <KpiCard icon="👁" label="Views"      value={stats.totalViews}
          accent="text-blue-400" trend="up" />
        <KpiCard icon="⬡" label="Copies"     value={stats.totalCopies}
          accent="text-violet-400" trend="up" />
        <KpiCard icon="%" label="Conversion" value={`${conversionRate}%`} sub="copies / views"
          accent={convNum >= 5 ? "text-emerald-400" : convNum >= 2 ? "text-amber-400" : "text-red-400"}
          trend={convNum >= 5 ? "up" : convNum < 2 ? "down" : "neutral"} />
      </div>

      {/* Middle row */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Top Galleries */}
        <Card className="p-5">
          <SectionTitle>🏆 Top by Views</SectionTitle>
          <div className="space-y-3">
            {topGalleries.map((g, i) => {
              const rate = g.stats.total_views > 0 ? Math.round((g.stats.total_copies / g.stats.total_views) * 100) : 0
              return (
                <div key={g.id} className="flex items-center gap-3">
                  <span style={{ color: C.muted }} className="text-xs w-4 shrink-0 font-bold">{i + 1}</span>
                  <img src={getGalleryThumbnail(g) || "/placeholder.jpg"} alt=""
                    className="w-9 h-9 rounded-lg object-cover shrink-0" style={{ borderColor: C.border, border: "1px solid" }}
                    onError={(e) => { e.currentTarget.style.opacity = "0.2" }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ color: C.text }} className="text-sm font-semibold truncate">{g.title}</div>
                    <div style={{ color: C.muted }} className="text-[9px]">{rate}% copy rate</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-blue-400">{g.stats.total_views.toLocaleString()}</div>
                    <div style={{ color: C.muted }} className="text-[9px]">{g.stats.total_copies} copies</div>
                  </div>
                </div>
              )
            })}
            {topGalleries.length === 0 && <div style={{ color: C.muted }} className="text-xs">No galleries yet</div>}
          </div>
        </Card>

        {/* Recent Logins */}
        <Card className="p-5">
          <SectionTitle>🕐 Recent Logins</SectionTitle>
          <div className="space-y-3">
            {recentUsers.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={u.avatar ?? "/placeholder-user.jpg"} className="w-7 h-7 rounded-full shrink-0" style={{ border: `1px solid ${C.border}` }} alt="" />
                  <div className="min-w-0">
                    <div style={{ color: C.text }} className="text-sm font-semibold truncate">{u.discord_tag}</div>
                    <div className="flex gap-1 mt-0.5">
                      {u.roles_cache.active_roles.slice(0, 2).map((r) => <RoleBadge key={r} role={r as string} />)}
                      {u.roles_cache.active_roles.length === 0 && <span style={{ color: C.muted }} className="text-[9px]">No roles</span>}
                    </div>
                  </div>
                </div>
                <div style={{ color: C.muted }} className="text-[9px] shrink-0">
                  {new Date(u.last_login).toLocaleDateString("th-TH")}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Activity Feed */}
        <Card className="p-5">
          <SectionTitle>⚡ Activity</SectionTitle>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {allAudit.length === 0 && <div style={{ color: C.muted }} className="text-xs">No activity yet</div>}
            {allAudit.map((e, i) => {
              const isCopy  = e.action === "copy_link"
              const isBan   = e.action.startsWith("admin_ban") || e.action === "banned_by_admin"
              const isAdmin = e.action.startsWith("admin_")
              return (
                <div key={i} className="flex items-start gap-2 group">
                  <img src={e.user.avatar ?? "/placeholder-user.jpg"}
                    className="w-5 h-5 rounded-full shrink-0 mt-0.5" style={{ border: `1px solid ${C.border}` }} alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span style={{ color: C.text }} className="text-[11px] font-semibold truncate max-w-[72px]">
                        {e.user.discord_tag.split("#")[0]}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isBan   ? "bg-red-900/40 text-red-400"
                        : isAdmin ? "bg-violet-900/40 text-violet-400"
                        : isCopy  ? "bg-blue-900/30 text-blue-400"
                        : "bg-white/5 text-white/40"
                      }`}>{e.action}</span>
                    </div>
                    <div style={{ color: C.muted }} className="text-[9px] mt-0.5">
                      {new Date(e.timestamp).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Galleries Tab ────────────────────────────────────────────────────────────
function GalleriesTab({
  galleries, tags, run, notify, isPending,
}: {
  galleries: Gallery[]; tags: Tag[]
  run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void
  notify: (msg: string, type?: "ok" | "err") => void
  isPending: boolean
}) {
  const [viewMode, setViewMode] = useState<"list" | "grid" | "table">("list")
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all")
  const [filterTag, setFilterTag] = useState<string>("all")
  const [filterRole, setFilterRole] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("views")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingGallery, setEditingGallery] = useState<Gallery | null>(null)
  const [creatingGallery, setCreatingGallery] = useState(false)
  const [expandedLinks, setExpandedLinks] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<Gallery | null>(null)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false)

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("desc") }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span style={{ color: C.border }} className="ml-0.5">↕</span>
    return <span className="text-blue-400 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  const activeTags = tags.filter(t => t.is_active)

  const filtered = useMemo(() => {
    let list = galleries.filter((g) => {
      const q = search.toLowerCase()
      const matchSearch = g.title.toLowerCase().includes(q) || g.id.includes(q)
      const matchStatus = filterStatus === "all" || (filterStatus === "active" ? g.is_active : !g.is_active)
      const matchTag = filterTag === "all" || g.tags.includes(filterTag)
      const matchRole = filterRole === "all" || g.access.min_role_name === filterRole
      return matchSearch && matchStatus && matchTag && matchRole
    })
    list = [...list].sort((a, b) => {
      let va: number, vb: number
      switch (sortField) {
        case "title":   return sortDir === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
        case "views":   va = a.stats.total_views;  vb = b.stats.total_views;  break
        case "copies":  va = a.stats.total_copies; vb = b.stats.total_copies; break
        case "rate":
          va = a.stats.total_views > 0 ? a.stats.total_copies / a.stats.total_views : 0
          vb = b.stats.total_views > 0 ? b.stats.total_copies / b.stats.total_views : 0; break
        case "links":   va = a.links.length; vb = b.links.length; break
        case "created":
          return sortDir === "asc"
            ? new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
            : new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        default: va = 0; vb = 0
      }
      return sortDir === "asc" ? va - vb : vb - va
    })
    return [...list.filter(g => g.is_pinned), ...list.filter(g => !g.is_pinned)]
  }, [galleries, search, filterStatus, filterTag, filterRole, sortField, sortDir])

  function toggleSelect(id: string) {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s)
  }
  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(g => g.id)))
  }

  const hasFilters = search || filterStatus !== "all" || filterTag !== "all" || filterRole !== "all"

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span style={{ color: C.muted }} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">⌕</span>
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or ID…" className="w-full pl-8 pr-8" />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: C.muted }}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white text-lg leading-none">×</button>
          )}
        </div>

        {/* Status filter */}
        <div style={{ backgroundColor: C.surface, borderColor: C.border }} className="flex gap-1 border rounded-xl p-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={filterStatus !== s ? { color: C.dim } : {}}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize ${
                filterStatus === s ? "bg-blue-600 text-white" : "hover:text-white"
              }`}>{s}</button>
          ))}
        </div>

        {activeTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
            style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text } as React.CSSProperties}
            className="border rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 cursor-pointer">
            <option value="all">All Tags</option>
            {activeTags.map(t => <option key={t.id} value={t.id}>{t.display}</option>)}
          </select>
        )}

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text } as React.CSSProperties}
          className="border rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 cursor-pointer">
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* View toggle */}
        <div style={{ backgroundColor: C.surface, borderColor: C.border }} className="flex gap-1 border rounded-xl p-1">
          {(["list", "grid", "table"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              style={viewMode !== m ? { color: C.dim } : {}}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize ${
                viewMode === m ? "bg-blue-600 text-white" : "hover:text-white"
              }`}>{m === "list" ? "≡" : m === "grid" ? "⊞" : "☰"} {m.charAt(0).toUpperCase() + m.slice(1)}</button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => exportGalleriesToCSV(filtered, tags)}
            title="Export filtered galleries to CSV"
            style={{ borderColor: C.border, color: C.dim } as React.CSSProperties}
            className="px-3 py-2 border rounded-xl text-xs font-semibold hover:text-white hover:border-[#252538] transition-colors flex items-center gap-1.5"
          >
            ⬇ CSV
          </button>
          <PrimaryBtn onClick={() => setCreatingGallery(true)}>+ New Gallery</PrimaryBtn>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{ backgroundColor: "#0a1520", borderColor: "#1e3a5f" }} className="flex items-center gap-3 px-4 py-3 border rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">{selected.size}</div>
            <span className="text-sm font-semibold text-blue-300">selected</span>
          </div>
          <div style={{ backgroundColor: C.border }} className="h-4 w-px mx-1" />
          <div className="flex gap-2 flex-wrap">
            <ActionBtn variant="green" onClick={() => run(() => adminBulkToggleGalleries([...selected], true), `${selected.size} activated`)}>✓ Activate</ActionBtn>
            <ActionBtn variant="orange" onClick={() => run(() => adminBulkToggleGalleries([...selected], false), `${selected.size} deactivated`)}>✗ Deactivate</ActionBtn>
            <button onClick={() => setBulkDeleteDialog(true)}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 border border-red-500 rounded-lg text-white font-bold transition-colors">
              🗑 Delete ({selected.size})
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} style={{ color: C.muted }} className="ml-auto px-2 py-1 text-xs hover:text-white transition-colors">✕ Clear</button>
        </div>
      )}

      {/* Status line */}
      <div className="flex items-center justify-between">
        <div style={{ color: C.muted }} className="text-xs">
          Showing <span style={{ color: C.text }} className="font-semibold">{filtered.length}</span> of <span style={{ color: C.text }}>{galleries.length}</span> galleries
          {filterStatus !== "all" && <span className="ml-1 text-blue-400">· {filterStatus}</span>}
          {filterTag !== "all" && <span className="ml-1 text-purple-400">· tag filtered</span>}
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setFilterStatus("all"); setFilterTag("all"); setFilterRole("all") }}
            style={{ color: C.muted }} className="text-xs hover:text-red-400 transition-colors">✕ Clear filters</button>
        )}
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <Card className="overflow-hidden divide-y" style={{ "--divider": C.border } as React.CSSProperties}>
          {/* Header */}
          <div style={{ backgroundColor: C.bg, gridTemplateColumns: "2rem 3rem 1fr 6rem 5rem 5rem 4rem 7rem 9rem" } as React.CSSProperties} className="grid items-center gap-4 px-4 py-2.5">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll} className="accent-blue-500 cursor-pointer" />
            <div />
            <button onClick={() => toggleSort("title")} style={{ color: C.dim }}
              className="flex items-center text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors text-left">
              Gallery <SortIcon field="title" />
            </button>
            {["Role", "Views", "Copies", "Rate", "Status"].map((h) => (
              <div key={h}>
                {["Views", "Copies", "Rate"].includes(h) ? (
                  <button onClick={() => toggleSort(h.toLowerCase() as SortField)} style={{ color: C.dim }}
                    className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">
                    {h} <SortIcon field={h.toLowerCase() as SortField} />
                  </button>
                ) : (
                  <div style={{ color: C.dim }} className="text-[10px] font-bold uppercase tracking-widest">{h}</div>
                )}
              </div>
            ))}
            <div style={{ color: C.dim }} className="text-[10px] font-bold uppercase tracking-widest text-right">Actions</div>
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center" style={{ color: C.muted }}>
              <div className="text-4xl mb-2 opacity-20">⊞</div>
              <div className="text-sm">No galleries found</div>
              {hasFilters && <div className="text-xs mt-1">Try adjusting your filters</div>}
            </div>
          )}

          {/* Virtual scroll container */}
          {filtered.length > 0 && (
            <VirtualGalleryList
              items={filtered}
              tags={tags}
              selected={selected}
              expandedLinks={expandedLinks}
              onToggleSelect={toggleSelect}
              onEdit={setEditingGallery}
              onDelete={setDeleteDialog}
              onToggleLinks={(id) => setExpandedLinks(expandedLinks === id ? null : id)}
              onToggleActive={(g) => run(() => adminUpdateGallery(g.id, { is_active: !g.is_active }), g.is_active ? "Deactivated" : "Activated")}
              run={run}
              notify={notify}
            />
          )}
        </Card>
      )}

      {/* GRID VIEW */}
      {viewMode === "grid" && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll} className="accent-blue-500 cursor-pointer w-4 h-4" />
            <span style={{ color: C.dim }} className="text-xs font-semibold">
              {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
            </span>
            {selected.size > 0 && <span className="text-xs text-blue-400">{selected.size} of {filtered.length} selected</span>}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((g) => {
              const copyRate = g.stats.total_views > 0 ? ((g.stats.total_copies / g.stats.total_views) * 100).toFixed(1) : "0.0"
              const tagObjs = tags.filter((t) => g.tags.includes(t.id))
              const isSelected = selected.has(g.id)
              return (
                <div key={g.id}
                  style={{ borderColor: isSelected ? "#3b82f6" : g.is_pinned ? "#f59e0b55" : C.border, backgroundColor: C.surface }}
                  className="group relative border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-black/40">
                  <div className="relative h-40 overflow-hidden" style={{ backgroundColor: C.bg }}>
                    <img src={getGalleryThumbnail(g) || "/placeholder.jpg"} alt={g.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; e.currentTarget.style.opacity = "0.3" }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute top-2 left-2 flex gap-1">
                      {!g.is_active && <span className="bg-red-900/90 text-red-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-700/40 backdrop-blur-sm">INACTIVE</span>}
                      {g.is_pinned && <span className="bg-amber-900/90 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-700/40 backdrop-blur-sm">📌</span>}
                    </div>
                    <div className="absolute top-2 right-2">
                      <div onClick={(e) => { e.stopPropagation(); toggleSelect(g.id) }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${
                          isSelected ? "bg-blue-600 border-blue-500" : "bg-black/40 border-white/30 hover:border-white/60"
                        }`}>
                        {isSelected && <span className="text-[10px] text-white font-bold">✓</span>}
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                      <span className="text-[9px] text-white/80 font-semibold bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">👁 {g.stats.total_views.toLocaleString()}</span>
                      <span className="text-[9px] text-emerald-300 font-bold bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">{copyRate}%</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 flex gap-1 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                      <button onClick={() => setEditingGallery(g)} className="flex-1 py-1.5 text-[10px] font-bold bg-blue-600/95 hover:bg-blue-600 rounded text-white">✏ Edit</button>
                      <button onClick={() => setExpandedLinks(expandedLinks === g.id ? null : g.id)}
                        style={{ backgroundColor: "#1c1c2eed" }} className="flex-1 py-1.5 text-[10px] font-bold hover:bg-[#252538] rounded text-white">🔗 {g.links.length}</button>
                      <button onClick={() => run(() => adminUpdateGallery(g.id, { is_active: !g.is_active }), g.is_active ? "Deactivated" : "Activated")}
                        className={`py-1.5 px-2 text-[10px] font-bold rounded transition-colors ${g.is_active ? "bg-orange-900/80 hover:bg-orange-900 text-orange-300" : "bg-green-900/80 hover:bg-green-900 text-green-300"}`}>
                        {g.is_active ? "Hide" : "Show"}
                      </button>
                      <button onClick={() => setDeleteDialog(g)} className="py-1.5 px-2 text-[10px] font-bold bg-red-900/80 hover:bg-red-900 rounded text-red-300">Del</button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <div style={{ color: C.text }} className="text-sm font-bold truncate">{g.title}</div>
                      <div style={{ color: C.muted }} className="text-[9px] font-mono truncate mt-0.5">{g.id.slice(0, 16)}…</div>
                    </div>
                    {tagObjs.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {tagObjs.slice(0, 3).map((t) => (
                          <span key={t.id} style={{ backgroundColor: t.color + "22", color: t.color, borderColor: t.color + "44" }}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded border">{t.display}</span>
                        ))}
                        {tagObjs.length > 3 && <span style={{ color: C.muted }} className="text-[9px]">+{tagObjs.length - 3}</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1 text-center">
                      {[["Views", g.stats.total_views.toLocaleString(), C.text], ["Copies", g.stats.total_copies, "text-blue-400"], ["Links", g.links.length, C.text]].map(([l, v, a]) => (
                        <div key={l as string} style={{ backgroundColor: C.bg }} className="rounded-lg py-1.5">
                          <div style={{ color: C.muted }} className="text-[9px] uppercase">{l}</div>
                          <div className={`text-xs font-bold ${typeof a === "string" && a.startsWith("text-") ? a : ""}`} style={typeof a === "string" && !a.startsWith("text-") ? { color: a } : {}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
                      <RoleBadge role={g.access.min_role_name} />
                      <div className="flex gap-1">
                        <button onClick={() => run(() => adminUpdateGallery(g.id, { is_pinned: !g.is_pinned }), g.is_pinned ? "Unpinned" : "Pinned")}
                          style={g.is_pinned ? {} : { backgroundColor: C.border, color: C.muted }}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${g.is_pinned ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50" : "hover:text-white"}`}>
                          {g.is_pinned ? "📌" : "📍"}
                        </button>
                        <button onClick={() => setDeleteDialog(g)}
                          style={{ backgroundColor: C.border, color: C.muted }}
                          className="text-[10px] px-1.5 py-0.5 hover:bg-red-900/30 hover:text-red-400 rounded transition-colors">🗑</button>
                      </div>
                    </div>
                  </div>
                  {expandedLinks === g.id && (
                    <div style={{ borderColor: C.border }} className="border-t">
                      <LinksPanel gallery={g} run={run} notify={notify} />
                    </div>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-20" style={{ color: C.muted }}>
                <div className="text-5xl mb-3 opacity-30">⊞</div>
                <div className="text-sm font-semibold mb-1">No galleries found</div>
                {hasFilters && <div className="text-xs">Try adjusting your filters</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderColor: C.border, backgroundColor: C.bg }} className="border-b">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll} className="accent-blue-500 cursor-pointer" />
                </th>
                {[["title", "Gallery"], ["access", "Access"], ["views", "Views"], ["rate", "Rate"], ["links", "Links"], [null, "Status"], [null, "Actions"]].map(([field, label]) => (
                  <th key={label as string} className={`px-4 py-3 ${label === "Actions" ? "text-right" : "text-left"}`}>
                    {field && ["title","views","rate","links"].includes(field as string) ? (
                      <button onClick={() => toggleSort(field as SortField)}
                        style={{ color: C.dim }} className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">
                        {label} <SortIcon field={field as SortField} />
                      </button>
                    ) : (
                      <span style={{ color: C.dim }} className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ borderColor: C.border }} className="divide-y">
              {filtered.map((g) => {
                const copyRate = g.stats.total_views > 0 ? ((g.stats.total_copies / g.stats.total_views) * 100).toFixed(1) : "0.0"
                const rateNum = parseFloat(copyRate)
                const activeLinks = g.links.filter(l => l.is_active).length
                const isSelected = selected.has(g.id)
                return (
                  <React.Fragment key={g.id}>
                    <tr style={{ backgroundColor: isSelected ? "#0a1520" : undefined }}
                      className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3">
                        <div onClick={() => toggleSelect(g.id)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all mx-auto ${
                            isSelected ? "bg-blue-600 border-blue-500" : "border-[#3a3a55] hover:border-blue-500"
                          }`}>
                          {isSelected && <span className="text-[9px] text-white font-black">✓</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <img src={getGalleryThumbnail(g) || "/placeholder.jpg"} alt=""
                            className="w-8 h-8 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${C.border}` }}
                            onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; e.currentTarget.style.opacity = "0.3" }} />
                          <div>
                            <div style={{ color: C.text }} className="font-semibold text-sm">{g.title}</div>
                            <div style={{ color: C.muted }} className="text-[9px] font-mono">{g.id.slice(0, 14)}…</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={g.access.min_role_name} /></td>
                      <td className="px-4 py-3 text-center">
                        <div style={{ color: C.text }} className="font-semibold text-sm">{g.stats.total_views.toLocaleString()}</div>
                        <div style={{ color: C.muted }} className="text-[9px]">{g.stats.total_copies} copies</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold ${rateNum >= 5 ? "text-emerald-400" : rateNum >= 2 ? "text-amber-400" : "text-zinc-500"}`}>{copyRate}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span style={{ color: C.text }} className="font-semibold text-sm">{activeLinks}</span>
                        <span style={{ color: C.muted }} className="text-xs">/{g.links.length}</span>
                      </td>
                      <td className="px-4 py-3 text-center"><StatusPill active={g.is_active} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <ActionBtn variant="blue" onClick={() => setEditingGallery(g)}>Edit</ActionBtn>
                          <ActionBtn onClick={() => setExpandedLinks(expandedLinks === g.id ? null : g.id)}>Links</ActionBtn>
                          <ActionBtn variant={g.is_active ? "orange" : "green"}
                            onClick={() => run(() => adminUpdateGallery(g.id, { is_active: !g.is_active }), g.is_active ? "Deactivated" : "Activated")}>
                            {g.is_active ? "Off" : "On"}
                          </ActionBtn>
                          <ActionBtn variant="red" onClick={() => setDeleteDialog(g)}>🗑</ActionBtn>
                        </div>
                      </td>
                    </tr>
                    {expandedLinks === g.id && (
                      <tr key={`${g.id}-links`}>
                        <td colSpan={8} style={{ backgroundColor: C.bg, borderColor: C.border }} className="px-4 pb-4 border-b">
                          <LinksPanel gallery={g} run={run} notify={notify} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center" style={{ color: C.muted }}>No galleries found</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modals */}
      {editingGallery && <EditGalleryModal gallery={editingGallery} tags={tags} onClose={() => setEditingGallery(null)} run={run} notify={notify} isPending={isPending} />}
      {creatingGallery && <CreateGalleryModal tags={tags} onClose={() => setCreatingGallery(false)} run={run} notify={notify} isPending={isPending} />}

      {deleteDialog && (
        <ConfirmDialog
          title={`Delete "${deleteDialog.title}"?`}
          message={`${deleteDialog.links.length} links will also be deleted. This cannot be undone.`}
          confirmLabel="Delete Gallery" danger
          onConfirm={() => { run(() => adminDeleteGallery(deleteDialog.id), "Gallery deleted"); setDeleteDialog(null) }}
          onCancel={() => setDeleteDialog(null)}
        />
      )}
      {bulkDeleteDialog && (
        <ConfirmDialog
          title={`Delete ${selected.size} galleries?`}
          message="All selected galleries and their links will be permanently deleted."
          confirmLabel={`Delete ${selected.size}`} danger
          onConfirm={() => {
            run(() => adminBulkDeleteGalleries([...selected]), `${selected.size} galleries deleted`)
            setSelected(new Set()); setBulkDeleteDialog(false)
          }}
          onCancel={() => setBulkDeleteDialog(false)}
        />
      )}
    </div>
  )
}

// ─── Virtual Gallery List (handles 500+ rows without freeze) ─────────────────
function VirtualGalleryList({
  items, tags, selected, expandedLinks,
  onToggleSelect, onEdit, onDelete, onToggleLinks, onToggleActive, run, notify,
}: {
  items: Gallery[]
  tags: Tag[]
  selected: Set<string>
  expandedLinks: string | null
  onToggleSelect: (id: string) => void
  onEdit: (g: Gallery) => void
  onDelete: (g: Gallery) => void
  onToggleLinks: (id: string) => void
  onToggleActive: (g: Gallery) => void
  run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void
  notify: (msg: string, type?: "ok" | "err") => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => expandedLinks === items[i]?.id ? 300 : 60,
    overscan: 8,
  })

  return (
    <div ref={parentRef} style={{ height: Math.min(items.length * 60 + 80, 640), overflowY: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const g = items[vRow.index]
          const copyRate = g.stats.total_views > 0 ? ((g.stats.total_copies / g.stats.total_views) * 100).toFixed(1) : "0.0"
          const rateNum = parseFloat(copyRate)
          const tagObjs = tags.filter(t => g.tags.includes(t.id))
          const isSelected = selected.has(g.id)
          const isExpanded = expandedLinks === g.id

          return (
            <div
              key={g.id}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              style={{ position: "absolute", top: vRow.start, left: 0, right: 0 }}
            >
              <div
                className={`grid items-center gap-4 px-4 py-3 transition-colors border-b ${isSelected ? "bg-blue-950/20" : "hover:bg-white/[0.02]"}`}
                style={{ gridTemplateColumns: "2rem 3rem 1fr 6rem 5rem 5rem 4rem 7rem 9rem", borderColor: C.border } as React.CSSProperties}
              >
                <div onClick={() => onToggleSelect(g.id)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${
                    isSelected ? "bg-blue-600 border-blue-500" : "border-[#3a3a55] hover:border-blue-500"
                  }`}>
                  {isSelected && <span className="text-[9px] text-white font-black">✓</span>}
                </div>
                <img src={getGalleryThumbnail(g) || "/placeholder.jpg"} alt={g.title}
                  className="w-10 h-10 rounded-lg object-cover" style={{ border: `1px solid ${C.border}` }}
                  onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; e.currentTarget.style.opacity = "0.3" }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {g.is_pinned && <span className="text-[10px] shrink-0">📌</span>}
                    <span style={{ color: C.text }} className="text-sm font-semibold truncate">{g.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span style={{ color: C.muted }} className="text-[9px] font-mono truncate">{g.id.slice(0, 12)}…</span>
                    {tagObjs.slice(0, 2).map(t => (
                      <span key={t.id} style={{ color: t.color, backgroundColor: t.color + "18" }}
                        className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0">{t.display}</span>
                    ))}
                  </div>
                </div>
                <RoleBadge role={g.access.min_role_name} />
                <div style={{ color: C.text }} className="text-xs font-semibold">{g.stats.total_views.toLocaleString()}</div>
                <div style={{ color: C.textSub }} className="text-xs">{g.stats.total_copies}</div>
                <div className={`text-xs font-bold ${rateNum >= 5 ? "text-emerald-400" : rateNum >= 2 ? "text-amber-400" : "text-zinc-500"}`}>{copyRate}%</div>
                <StatusPill active={g.is_active} />
                <div className="flex items-center justify-end gap-1">
                  <ActionBtn variant="blue" onClick={() => onEdit(g)}>Edit</ActionBtn>
                  <ActionBtn onClick={() => onToggleLinks(g.id)}>
                    {isExpanded ? "▲" : `▼ ${g.links.length}`}
                  </ActionBtn>
                  <ActionBtn variant={g.is_active ? "orange" : "green"} onClick={() => onToggleActive(g)}>
                    {g.is_active ? "Off" : "On"}
                  </ActionBtn>
                  <ActionBtn variant="red" onClick={() => onDelete(g)}>🗑</ActionBtn>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderColor: C.border, backgroundColor: C.bg }} className="border-b">
                  <LinksPanel gallery={g} run={run} notify={notify} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Links Panel ──────────���───────────────────────────────────────────────────
function LinksPanel({ gallery, run, notify }: { gallery: Gallery; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void; notify: (msg: string, type?: "ok" | "err") => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingLink, setEditingLink] = useState<string | null>(null)
  // ✅ v3.5: เพิ่ม imageUrls ให้ตรง AddLinkInput (z.array — output ของ AddLinkSchema)
  const [linkForm, setLinkForm] = useState<{
    label: string; url: string; copyLimit: number; minLevel: number; imageUrls: string[]
  }>({ label: "", url: "", copyLimit: 5, minLevel: gallery.access.min_hierarchy_level, imageUrls: [] })
  const [editForm, setEditForm] = useState<{ label: string; url: string; copyLimit: number; minLevel: number }>({ label: "", url: "", copyLimit: 5, minLevel: gallery.access.min_hierarchy_level })

  function startEdit(link: typeof gallery.links[0]) {
    setEditingLink(link.id)
    setEditForm({ label: link.label, url: link.url, copyLimit: link.copy_limit_per_user, minLevel: link.accessible_by_min_level })
  }

  return (
    <div className="mt-2" style={{ border: `1px solid ${C.border}`, borderRadius: "0.75rem", overflow: "hidden" }}>
      <div style={{ backgroundColor: C.bg, borderColor: C.border }} className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span style={{ color: C.textSub }} className="text-xs font-bold uppercase tracking-widest">🔗 {gallery.title}</span>
          <span style={{ color: C.muted }} className="text-[10px]">{gallery.links.filter(l => l.is_active).length}/{gallery.links.length} active</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition-colors">
          {showAdd ? "✕ Cancel" : "+ Add Link"}
        </button>
      </div>

      {showAdd && (
        <div style={{ backgroundColor: C.bg, borderColor: C.border }} className="px-4 py-4 border-b space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Label</Label>
              <Input value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} placeholder="x.com/user" className="w-full" />
            </div>
            <div className="md:col-span-2">
              <Label>URL</Label>
              <Input value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://…" className="w-full" />
            </div>
            <div>
              <Label>Copy Limit</Label>
              <Input type="number" min={1} max={999} value={linkForm.copyLimit}
                onChange={(e) => setLinkForm({ ...linkForm, copyLimit: Math.min(999, Math.max(1, Number(e.target.value))) })} className="w-full" />
            </div>
          </div>
          <div>
            <Label>Min Role</Label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => (
                <button key={r} onClick={() => setLinkForm({ ...linkForm, minLevel: ROLE_LEVELS[r] })}
                  style={{
                    borderColor: linkForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] : C.border,
                    color: linkForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] : C.dim,
                    backgroundColor: linkForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] + "22" : "transparent",
                  }}
                  className="px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all">{r}</button>
              ))}
            </div>
          </div>
          <PrimaryBtn onClick={() => {
            if (!linkForm.label || !linkForm.url) { notify("Label & URL required", "err"); return }
            run(() => adminAddLink(gallery.id, linkForm), "Link added")
            setShowAdd(false)
            setLinkForm({ label: "", url: "", copyLimit: 5, minLevel: gallery.access.min_hierarchy_level, imageUrls: [] })
          }}>Add Link</PrimaryBtn>
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderColor: C.border, backgroundColor: C.bg }} className="border-b">
            {["Label", "URL", "Min Role", "Limit", "Copies", "Status", "Actions"].map(h => (
              <th key={h} style={{ color: C.dim }}
                className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${h === "Actions" ? "text-right" : h === "Status" || h === "Limit" || h === "Copies" || h === "Min Role" ? "text-center" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ borderColor: C.border }} className="divide-y">
          {gallery.links.length === 0 && (
            <tr><td colSpan={7} style={{ color: C.muted }} className="px-4 py-8 text-center">No links yet — add one above</td></tr>
          )}
          {gallery.links.map((link) => (
            <React.Fragment key={link.id}>
              <tr key={link.id} className={`hover:bg-white/2 transition-colors ${!link.is_active ? "opacity-55" : ""}`}>
                <td style={{ color: C.text }} className="px-4 py-2.5 font-semibold">{link.label}</td>
                <td className="px-4 py-2.5 max-w-[200px]">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block" title={link.url}>
                    {link.url.length > 40 ? link.url.slice(0, 40) + "…" : link.url}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {(() => {
                    const rn = Object.entries(ROLE_LEVELS).find(([, v]) => v === link.accessible_by_min_level)?.[0]
                    return rn
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ borderColor: ROLE_COLORS[rn] + "44", color: ROLE_COLORS[rn], backgroundColor: ROLE_COLORS[rn] + "22" }}>{rn}</span>
                      : <span style={{ color: C.muted }} className="text-[10px]">Lv.{link.accessible_by_min_level}</span>
                  })()}
                </td>
                <td style={{ color: C.textSub }} className="px-4 py-2.5 text-center">{link.copy_limit_per_user}×</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={link.total_copies > 0 ? "text-blue-400 font-bold" : ""}
                    style={link.total_copies === 0 ? { color: C.muted } : {}}>{link.total_copies}</span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <StatusPill active={link.is_active} activeLabel="Live" inactiveLabel={link.null_reason ?? "Off"} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <ActionBtn onClick={() => startEdit(link)}>Edit</ActionBtn>
                    <ActionBtn variant={link.is_active ? "orange" : "green"}
                      onClick={() => run(() => adminUpdateLink(gallery.id, link.id, { is_active: !link.is_active, null_reason: link.is_active ? "link_dead" : null }), link.is_active ? "Disabled" : "Enabled")}>
                      {link.is_active ? "Disable" : "Enable"}
                    </ActionBtn>
                    <ActionBtn variant="red" onClick={() => run(() => adminDeleteLink(gallery.id, link.id), "Link deleted")}>Del</ActionBtn>
                  </div>
                </td>
              </tr>
              {editingLink === link.id && (
                <tr key={`${link.id}-edit`} style={{ backgroundColor: C.bg }}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 items-end">
                      {[["Label", "label"], ["URL", "url"]].map(([l, k]) => (
                        <div key={k}>
                          <Label>{l}</Label>
                          <Input value={editForm[k as "label"|"url"]} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })} className="w-full" />
                        </div>
                      ))}
                      <div>
                        <Label>Copy Limit</Label>
                        <Input type="number" min={1} max={999} value={editForm.copyLimit}
                          onChange={e => setEditForm({ ...editForm, copyLimit: Math.min(999, Math.max(1, Number(e.target.value))) })} className="w-full" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label>Min Role</Label>
                      <div className="flex gap-2 flex-wrap">
                        {ROLES.map((r) => (
                          <button key={r} onClick={() => setEditForm({ ...editForm, minLevel: ROLE_LEVELS[r] })}
                            style={{
                              borderColor: editForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] : C.border,
                              color: editForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] : C.dim,
                              backgroundColor: editForm.minLevel === ROLE_LEVELS[r] ? ROLE_COLORS[r] + "22" : "transparent",
                            }}
                            className="px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all">{r}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <PrimaryBtn onClick={() => {
                        if (!editForm.label || !editForm.url) { notify("Label & URL required", "err"); return }
                        run(() => adminUpdateLink(gallery.id, link.id, { label: editForm.label, url: editForm.url, copy_limit_per_user: editForm.copyLimit, accessible_by_min_level: editForm.minLevel }), "Link updated")
                        setEditingLink(null)
                      }}>Save</PrimaryBtn>
                      <GhostBtn onClick={() => setEditingLink(null)}>Cancel</GhostBtn>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ users, run, notify }: { users: AppUser[]; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void; notify: (msg: string, type?: "ok" | "err") => void }) {
  const [search, setSearch] = useState("")
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [banDialog, setBanDialog] = useState<AppUser | null>(null)
  const [banReason, setBanReason] = useState("")

  const filtered = users.filter(
    (u) => u.discord_tag.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()) || u.user_id.includes(search)
  )

  return (
    <div className="space-y-4">
      <Input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by tag, username, or user ID…" className="w-full max-w-md" />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderColor: C.border, backgroundColor: C.bg }} className="border-b">
              {["User", "Roles", "Logins", "Status", "Actions"].map(h => (
                <th key={h} style={{ color: C.dim }}
                  className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest ${h === "Actions" ? "text-right" : h === "Status" || h === "Logins" ? "text-center" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ borderColor: C.border }} className="divide-y">
            {filtered.map((u) => (
              <React.Fragment key={u.user_id}>
                <tr className={`hover:bg-white/2 transition-colors ${u.is_banned ? "opacity-55" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={u.avatar ?? "/placeholder-user.jpg"} className="w-8 h-8 rounded-full" style={{ border: `1px solid ${C.border}` }} alt="" />
                      <div>
                        <div style={{ color: C.text }} className="font-semibold">{u.discord_tag}</div>
                        <div style={{ color: C.muted }} className="text-[9px] font-mono">{u.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles_cache.active_roles.length === 0
                        ? <span style={{ color: C.muted }} className="text-xs">No roles</span>
                        : u.roles_cache.active_roles.map((r) => <RoleBadge key={r} role={r as string} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div style={{ color: C.text }} className="text-sm">{u.login_count}</div>
                    <div style={{ color: C.muted }} className="text-[9px]">{new Date(u.last_login).toLocaleDateString("th-TH")}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusPill active={!u.is_banned} activeLabel="Active" inactiveLabel="Banned" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn onClick={() => setExpandedUser(expandedUser === u.user_id ? null : u.user_id)}>Details</ActionBtn>
                      <ActionBtn onClick={() => run(() => adminForceRoleSync(u.user_id), "Role sync forced")}>Sync</ActionBtn>
                      {u.is_banned
                        ? <ActionBtn variant="green" onClick={() => run(() => adminUnbanUser(u.user_id), `${u.discord_tag} unbanned`)}>Unban</ActionBtn>
                        : <ActionBtn variant="red" onClick={() => { setBanReason(""); setBanDialog(u) }}>Ban</ActionBtn>
                      }
                    </div>
                  </td>
                </tr>
                {expandedUser === u.user_id && (
                  <tr key={`${u.user_id}-detail`}>
                    <td colSpan={5} style={{ backgroundColor: C.bg, borderColor: C.border }} className="px-4 pb-4 border-b">
                      <UserDetailPanel user={u} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ color: C.muted }} className="py-12 text-center">No users found</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {banDialog && (
        <ConfirmDialog
          title={`Ban ${banDialog.discord_tag}?`}
          message="This user will be immediately logged out and blocked."
          confirmLabel="Confirm Ban" danger
          withInput={{ label: "Ban Reason (required)", placeholder: "e.g. Sharing links outside", onValue: (v) => setBanReason(v) }}
          onConfirm={() => {
            if (!banReason.trim()) { notify("Ban reason is required", "err"); return }
            run(() => adminBanUser(banDialog.user_id, banReason.trim()), `${banDialog.discord_tag} banned`)
            setBanDialog(null)
          }}
          onCancel={() => setBanDialog(null)}
        />
      )}
    </div>
  )
}

// ─── User Detail Panel ────────────────────���───────────────────────────────────
function UserDetailPanel({ user }: { user: AppUser }) {
  const recentAudit = [...user.audit_log].reverse().slice(0, 10)
  const totalCopies = Object.values(user.link_usage).reduce((sum, g) => sum + Object.values(g).reduce((s, l) => s + l.copy_count, 0), 0)

  return (
    <div className="mt-3 grid md:grid-cols-2 gap-4">
      <Card className="p-4">
        <SectionTitle>Profile</SectionTitle>
        <div className="space-y-2 text-xs">
          {[
            ["User ID", user.user_id, "font-mono"],
            ["Username", user.username, ""],
            ["First Login", new Date(user.first_login).toLocaleString("th-TH"), ""],
            ["Last Login", new Date(user.last_login).toLocaleString("th-TH"), ""],
            ["Total Logins", user.login_count, ""],
            ["Total Copies", user.favorites.length, "text-blue-400 font-bold"],
            ["Favorites", user.favorites.length, ""],
          ].map(([l, v]) => (
            <div key={l as string} className="flex justify-between">
              <span style={{ color: C.muted }}>{l}</span>
              <span style={{ color: C.text }} className={typeof v === "number" && l === "Total Copies" ? "text-blue-400 font-bold" : ""}>{String(v)}</span>
            </div>
          ))}
          {user.is_banned && (
            <div className="flex justify-between">
              <span style={{ color: C.muted }}>Ban Reason</span>
              <span className="text-red-400">{user.ban_reason}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Cache Expires</span>
            <span className={new Date(user.roles_cache.cache_expires_at) < new Date() ? "text-red-400" : "text-emerald-400"}>
              {new Date(user.roles_cache.cache_expires_at).toLocaleTimeString("th-TH")}
            </span>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <SectionTitle>Recent Audit Log</SectionTitle>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
          {recentAudit.length === 0 && <div style={{ color: C.muted }} className="text-xs">No activity</div>}
          {recentAudit.map((entry, i) => (
            <div key={i} className="flex items-start justify-between text-[11px]">
              <div>
                <span style={{ color: C.text }} className="font-mono">{entry.action}</span>
                {entry.gallery_id && <span style={{ color: C.muted }} className="ml-1">/ {entry.gallery_id.slice(0, 8)}</span>}
              </div>
              <span style={{ color: C.muted }} className="ml-2 shrink-0">
                {new Date(entry.timestamp).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Tags Tab ─────────────────────────────────────────────────────────────────
function TagsTab({ tags, run, notify, session }: { tags: Tag[]; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void; notify: (msg: string, type?: "ok" | "err") => void; session: SessionUser }) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", display: "", color: "#3b82f6" })
  const [deleteDialog, setDeleteDialog] = useState<Tag | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div style={{ color: C.textSub }} className="text-sm">
          {tags.filter(t => t.is_active).length} active of {tags.length} tags
        </div>
        <PrimaryBtn onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "✕ Cancel" : "+ New Tag"}
        </PrimaryBtn>
      </div>

      {showCreate && (
        <Card className="p-6 space-y-4">
          <div style={{ color: C.text }} className="text-sm font-bold">Create New Tag</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Name (slug)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                placeholder="onlyfans" className="w-full" />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value })}
                placeholder="OnlyFans" className="w-full" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" />
                <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="flex-1 font-mono" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <PrimaryBtn onClick={() => {
              if (!form.name || !form.display) { notify("Name & display required", "err"); return }
              run(() => adminCreateTag({ ...form }), `Tag "${form.display}" created`)
              setShowCreate(false); setForm({ name: "", display: "", color: "#3b82f6" })
            }}>Create Tag</PrimaryBtn>
            <GhostBtn onClick={() => setShowCreate(false)}>Cancel</GhostBtn>
            {form.name && form.display && (
              <div style={{ backgroundColor: form.color + "22", color: form.color, borderColor: form.color + "44" }}
                className="px-3 py-1 rounded-lg border text-xs font-bold">
                Preview: #{form.display}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tags.map((t) => (
          <Card key={t.id} className="p-4 hover:border-[#252538] transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div style={{ backgroundColor: t.color + "22", color: t.color, borderColor: t.color + "44" }}
                className="px-3 py-1 rounded-lg border text-sm font-bold">#{t.display}</div>
              <StatusPill active={t.is_active} />
            </div>
            <div style={{ color: C.muted }} className="text-[10px] space-y-0.5 mb-3">
              <div>Slug: <span style={{ color: C.text }} className="font-mono">{t.name}</span></div>
              <div>Color: <span className="font-mono" style={{ color: t.color }}>{t.color}</span></div>
              <div>Galleries: <span style={{ color: C.text }}>{t.gallery_count}</span></div>
              {t.updated_at && <div>Updated: <span style={{ color: C.text }}>{new Date(t.updated_at).toLocaleDateString("th-TH")}</span></div>}
            </div>
            <div className="flex gap-2">
              <ActionBtn
                variant={t.is_active ? "orange" : "green"}
                onClick={() => run(() => adminUpdateTag(t.id, { is_active: !t.is_active }), t.is_active ? "Tag disabled" : "Tag enabled")}
              >{t.is_active ? "Disable" : "Enable"}</ActionBtn>
              <ActionBtn variant="red" onClick={() => setDeleteDialog(t)}>Delete</ActionBtn>
            </div>
          </Card>
        ))}
        {tags.length === 0 && (
          <div className="col-span-full text-center py-16" style={{ color: C.muted }}>
            <div className="text-3xl mb-2 opacity-20">#</div>
            <div className="text-sm">No tags yet</div>
          </div>
        )}
      </div>

      {deleteDialog && (
        <ConfirmDialog
          title={`Delete tag "#${deleteDialog.display}"?`}
          message={`Will be removed from ${deleteDialog.gallery_count} galleries.`}
          confirmLabel="Delete Tag" danger
          onConfirm={() => { run(() => adminDeleteTag(deleteDialog.id), "Tag deleted"); setDeleteDialog(null) }}
          onCancel={() => setDeleteDialog(null)}
        />
      )}
    </div>
  )
}

// ─── Announcement Tab ─────────────────────────────────────────────────────────
function AnnouncementTab({ current, run }: { current: AnnouncementBanner | null; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void }) {
  const [message, setMessage] = useState(current?.message ?? "")
  const [type, setType] = useState<"info" | "warning" | "success">(current?.type ?? "info")

  const typeConfig = {
    info:    { label: "ℹ️ Info",    border: "#1e3a5f", text: "text-blue-400",   bg: "bg-blue-900/20" },
    warning: { label: "⚠️ Warning", border: "#3e2e00", text: "text-amber-400",  bg: "bg-amber-900/20" },
    success: { label: "✅ Success", border: "#0a2e18", text: "text-emerald-400", bg: "bg-emerald-900/20" },
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-6 space-y-5">
        <div style={{ color: C.text }} className="text-sm font-bold">Announcement Banner</div>
        <div style={{ color: C.muted }} className="text-xs">Banner shown to all users on the main page. Leave blank to clear.</div>

        {current && (
          <div style={{ borderColor: typeConfig[current.type].border }} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${typeConfig[current.type].bg} ${typeConfig[current.type].text}`}>
            <span>{current.type === "info" ? "ℹ️" : current.type === "warning" ? "⚠️" : "✅"}</span>
            <div>
              <div className="font-semibold">{current.message}</div>
              <div className="text-[10px] opacity-70 mt-1">Active since {new Date(current.created_at).toLocaleString("th-TH")}</div>
            </div>
          </div>
        )}

        <div>
          <Label>Type</Label>
          <div className="flex gap-2">
            {(["info", "warning", "success"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                style={{ borderColor: type === t ? typeConfig[t].border : C.border, color: type === t ? undefined : C.dim } as React.CSSProperties}
              >{typeConfig[t].label}</button>
            ))}
          </div>
        </div>

        <div>
          <Label>Message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            placeholder="Type announcement here… (empty = clear)" className="w-full" />
        </div>

        {message && (
          <div style={{ borderColor: typeConfig[type].border }} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${typeConfig[type].bg} ${typeConfig[type].text}`}>
            <span>{type === "info" ? "ℹ️" : type === "warning" ? "⚠️" : "✅"}</span>
            <span>{message}</span>
          </div>
        )}

        <div className="flex gap-3">
          <PrimaryBtn onClick={() => run(async () => { const r = await adminSetAnnouncement(message ? { message, type, created_at: new Date().toISOString() } : null); return { ok: r.ok } }, message ? "Announcement set" : "Announcement cleared")}>
            {message ? "Set Announcement" : "Clear Announcement"}
          </PrimaryBtn>
          {current && (
            <button onClick={() => { setMessage(""); run(async () => { const r = await adminSetAnnouncement(null); return { ok: r.ok } }, "Announcement cleared") }}
              style={{ borderColor: "#991b1b", color: "#f87171" }}
              className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-red-900/20 transition-colors">Clear Now</button>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────
function BackupTab({ notify, galleries, run }: { notify: (msg: string, type?: "ok" | "err") => void; galleries: Gallery[]; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void }) {
  const [isExporting, setIsExporting] = useState(false)
  const totalLinks = galleries.reduce((a, g) => a + g.links.length, 0)
  const deadLinks  = galleries.flatMap((g) => g.links).filter((l) => !l.is_active).length
  const healthPct  = totalLinks > 0 ? Math.round(((totalLinks - deadLinks) / totalLinks) * 100) : 100

  async function handleExport() {
    setIsExporting(true)
    try {
      const result = await adminCreateBackup()
      if (!result.ok) { notify("Backup failed", "err"); return }
      window.open(result.data.url, "_blank")
      notify("เปิด Supabase Backup Dashboard แล้ว")
    } catch (e) { notify((e as Error).message, "err") }
    finally { setIsExporting(false) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-6">
        <SectionTitle>🔗 Link Health Monitor</SectionTitle>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <KpiCard label="Total Links" value={totalLinks} />
          <KpiCard label="Active" value={totalLinks - deadLinks} accent="text-emerald-400" trend="up" />
          <KpiCard label="Dead / Off" value={deadLinks} accent={deadLinks > 0 ? "text-red-400" : "text-white"} trend={deadLinks > 0 ? "down" : "neutral"} />
        </div>
        <div className="mb-5">
          <div className="flex justify-between mb-1.5">
            <span style={{ color: C.muted }} className="text-xs">Health Score</span>
            <span className={`text-xs font-bold ${healthPct === 100 ? "text-emerald-400" : healthPct > 70 ? "text-amber-400" : "text-red-400"}`}>{healthPct}%</span>
          </div>
          <div style={{ backgroundColor: C.border }} className="h-1.5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${healthPct === 100 ? "bg-emerald-500" : healthPct > 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${healthPct}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {galleries.flatMap((g) => g.links.filter((l) => !l.is_active).map((l) => (
            <div key={l.id} style={{ backgroundColor: "#150808", borderColor: "#3a1010" }} className="flex items-center justify-between px-3 py-2 border rounded-xl">
              <div>
                <div className="text-xs font-semibold text-red-400">{l.label}</div>
                <div style={{ color: C.muted }} className="text-[9px]">{g.title} · {l.null_reason ?? "disabled"}</div>
              </div>
              <div style={{ color: C.muted }} className="text-[9px]">{l.total_copies} copies</div>
            </div>
          )))}
          {deadLinks === 0 && <div className="text-xs text-emerald-400">✓ All links are active</div>}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div style={{ color: C.text }} className="text-sm font-bold">💾 Database Backup</div>
        <div style={{ color: C.muted }} className="text-xs">Full JSON snapshot of all data. Store it somewhere safe.</div>
        <div style={{ backgroundColor: "#1a1400", borderColor: "#78350f" }} className="p-3 border rounded-xl text-xs text-amber-400">
          ⚠️ Contains user data including audit logs. Handle with care.
        </div>
        <button onClick={handleExport} disabled={isExporting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center gap-2 text-white transition-colors">
          {isExporting
            ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Preparing…</>
            : <>⬇ Download Backup</>}
        </button>
      </Card>
    </div>
  )
}

// ─── Edit Gallery Modal ────────────────────────────────────────────────────────
function EditGalleryModal({ gallery, tags, onClose, run, notify, isPending }: { gallery: Gallery; tags: Tag[]; onClose: () => void; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void; notify: (msg: string, type?: "ok" | "err") => void; isPending: boolean }) {
  const [form, setForm] = useState({
    title: gallery.title, description: gallery.description, thumbnail: gallery.thumbnail,
    tags: gallery.tags, minRoleName: gallery.access.min_role_name, minLevel: gallery.access.min_hierarchy_level,
    is_pinned: gallery.is_pinned, is_active: gallery.is_active, images: gallery.images || [],
  })
  const initialImages =
    gallery.images && gallery.images.length > 0 ? gallery.images
    : gallery.thumbnail ? [{ id: crypto.randomUUID(), url: gallery.thumbnail, sort_order: 0, added_at: new Date().toISOString() }]
    : []
  const [images, setImages] = useState<import("@/lib/types").GalleryImage[]>(initialImages)
  const [thumbError, setThumbError] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [onClose])

  function handleSave() {
    if (!form.title.trim()) { notify("Title is required", "err"); return }
    run(() => adminUpdateGallery(gallery.id, {
      title: form.title, description: form.description,
      thumbnail: images[0]?.url || form.thumbnail, images: images.map((img) => img.url),
      tags: form.tags, minRoleName: form.minRoleName, minLevel: form.minLevel,
      is_pinned: form.is_pinned, is_active: form.is_active,
    }), `"${form.title}" updated`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div style={{ backgroundColor: C.surface, borderColor: C.border }} className="border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.border, backgroundColor: C.surface }} className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10">
          <div>
            <div style={{ color: C.text }} className="text-sm font-bold">✏️ Edit Gallery</div>
            <div style={{ color: C.muted }} className="text-[9px] font-mono mt-0.5">{gallery.id}</div>
          </div>
          <button onClick={onClose} style={{ color: C.muted }}
            className="hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors">×</button>
        </div>
        <div className="p-6 space-y-5">
          {form.thumbnail && !thumbError && (
            <div style={{ borderColor: C.border }} className="relative h-32 rounded-xl overflow-hidden border">
              <img src={form.thumbnail} alt="" className="w-full h-full object-cover" onError={() => setThumbError(true)} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end px-3 pb-2">
                <span style={{ color: "rgba(255,255,255,0.5)" }} className="text-[9px]">Thumbnail preview</span>
              </div>
            </div>
          )}
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full" /></div>
          <ThumbnailUrlManager images={images} onChange={(newImages) => { setImages(newImages); if (newImages.length > 0) setForm({ ...form, thumbnail: newImages[0].url }) }} disabled={isPending} />
          <div>
            <Label>Min Role Required</Label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => (
                <button key={r} onClick={() => setForm({ ...form, minRoleName: r, minLevel: ROLE_LEVELS[r] })}
                  style={{ borderColor: form.minRoleName === r ? ROLE_COLORS[r] : C.border, color: form.minRoleName === r ? ROLE_COLORS[r] : C.dim, backgroundColor: form.minRoleName === r ? ROLE_COLORS[r] + "22" : "transparent" }}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all">{r}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Tags ({form.tags.length} selected)</Label>
            <div className="flex gap-2 flex-wrap">
              {tags.filter((t) => t.is_active).map((t) => {
                const sel = form.tags.includes(t.id)
                return (
                  <button key={t.id}
                    onClick={() => { const s = new Set(form.tags); sel ? s.delete(t.id) : s.add(t.id); setForm({ ...form, tags: [...s] }) }}
                    style={{ borderColor: sel ? t.color : C.border, color: sel ? t.color : C.dim, backgroundColor: sel ? t.color + "22" : "transparent" }}
                    className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all">{t.display}</button>
                )
              })}
              {tags.filter((t) => t.is_active).length === 0 && <span style={{ color: C.muted }} className="text-xs">No active tags</span>}
            </div>
          </div>
          <div className="flex gap-6">
            <Toggle value={form.is_pinned} onChange={(v) => setForm({ ...form, is_pinned: v })} label="📌 Pinned" />
            <Toggle value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
          </div>
        </div>
        <div style={{ borderColor: C.border, backgroundColor: C.bg }} className="flex items-center justify-between px-6 py-4 border-t rounded-b-2xl sticky bottom-0">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={handleSave}>Save Changes</PrimaryBtn>
        </div>
      </div>
    </div>
  )
}

// ─── Create Gallery Modal ─────────────────────────────────────────────────────
function CreateGalleryModal({ tags, onClose, run, notify, isPending }: { tags: Tag[]; onClose: () => void; run: (fn: () => Promise<{ ok: boolean }>, msg: string) => void; notify: (msg: string, type?: "ok" | "err") => void; isPending: boolean }) {
  const [form, setForm] = useState({
    title: "", description: "", thumbnail: "",
    tags: [] as string[], minRoleName: ROLES[0] as typeof ROLES[number],
    minLevel: 1, isPinned: false, images: [] as string[],
  })
  const [images, setImages] = useState<import("@/lib/types").GalleryImage[]>([])
  const [thumbError, setThumbError] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [onClose])

  function handleCreate() {
    if (!form.title.trim()) { notify("Title is required", "err"); return }
    run(() => adminCreateGallery({
      title: form.title, description: form.description,
      thumbnail: images[0]?.url || form.thumbnail, images: images.map((img) => img.url),
      tags: form.tags, minLevel: form.minLevel, minRoleName: form.minRoleName, isPinned: form.isPinned,
    }), `"${form.title}" created`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div style={{ backgroundColor: C.surface, borderColor: C.border }} className="border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.border, backgroundColor: C.surface }} className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10">
          <div style={{ color: C.text }} className="text-sm font-bold">✨ Create New Gallery</div>
          <button onClick={onClose} style={{ color: C.muted }}
            className="hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors">×</button>
        </div>
        <div className="p-6 space-y-5">
          {form.thumbnail && !thumbError && (
            <div style={{ borderColor: C.border }} className="relative h-28 rounded-xl overflow-hidden border">
              <img src={form.thumbnail} alt="" className="w-full h-full object-cover" onError={() => setThumbError(true)} />
            </div>
          )}
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Gallery name…" autoFocus className="w-full" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Optional description…" className="w-full" /></div>
          <ThumbnailUrlManager images={images} onChange={(newImages) => { setImages(newImages); if (newImages.length > 0) setForm({ ...form, thumbnail: newImages[0].url }) }} disabled={isPending} />
          <div>
            <Label>Min Role Required</Label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => (
                <button key={r} onClick={() => setForm({ ...form, minRoleName: r, minLevel: ROLE_LEVELS[r] })}
                  style={{ borderColor: form.minRoleName === r ? ROLE_COLORS[r] : C.border, color: form.minRoleName === r ? ROLE_COLORS[r] : C.dim, backgroundColor: form.minRoleName === r ? ROLE_COLORS[r] + "22" : "transparent" }}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all">{r}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 flex-wrap">
              {tags.filter((t) => t.is_active).map((t) => {
                const sel = form.tags.includes(t.id)
                return (
                  <button key={t.id}
                    onClick={() => { const s = new Set(form.tags); sel ? s.delete(t.id) : s.add(t.id); setForm({ ...form, tags: [...s] }) }}
                    style={{ borderColor: sel ? t.color : C.border, color: sel ? t.color : C.dim, backgroundColor: sel ? t.color + "22" : "transparent" }}
                    className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all">{t.display}</button>
                )
              })}
              {tags.filter((t) => t.is_active).length === 0 && <span style={{ color: C.muted }} className="text-xs">No active tags</span>}
            </div>
          </div>
          <Toggle value={form.isPinned} onChange={(v) => setForm({ ...form, isPinned: v })} label="📌 Pin this gallery" />
        </div>
        <div style={{ borderColor: C.border, backgroundColor: C.bg }} className="flex items-center justify-between px-6 py-4 border-t rounded-b-2xl sticky bottom-0">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={handleCreate}>Create Gallery</PrimaryBtn>
        </div>
      </div>
    </div>
  )
}

// ─── Digital Override Tab ─────────────────────────────────────────────────────
function DigitalOverrideTab({ session, notify }: { session: SessionUser; notify: (msg: string, type?: "ok" | "err") => void }) {
  const [isPending, startTransition] = useTransition()
  const [overrides, setOverrides] = useState<import("@/lib/types").DigitalRoleOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [revokeDialog, setRevokeDialog] = useState<import("@/lib/types").DigitalRoleOverride | null>(null)
  const [form, setForm] = useState({
    userId: "", roleName: "69Bath" as import("@/lib/types").RoleName,
    expiresAt: "", note: "", confirmedByRoleId: "", durationPreset: "7d",
  })

  const presets = [
    { label: "1 วัน", value: "1d", days: 1 }, { label: "3 วัน", value: "3d", days: 3 },
    { label: "7 วัน", value: "7d", days: 7 }, { label: "14 วัน", value: "14d", days: 14 },
    { label: "30 วัน", value: "30d", days: 30 }, { label: "กำหนดเอง", value: "custom", days: 0 },
  ]

  function applyPreset(preset: typeof presets[0]) {
    setForm((f) => ({ ...f, durationPreset: preset.value }))
    if (preset.days > 0) {
      const d = new Date(); d.setDate(d.getDate() + preset.days); d.setHours(23, 59, 0, 0)
      setForm((f) => ({ ...f, durationPreset: preset.value, expiresAt: d.toISOString().slice(0, 16) }))
    }
  }

  async function loadOverrides() {
    setLoading(true)
    try {
      const { actionGetAllDigitalOverrides } = await import("@/app/admin/digital-override-actions")
      const res = await actionGetAllDigitalOverrides({ limit: 100 })
      if (res.ok) setOverrides(res.data)
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { loadOverrides() }, [])

  function handleCreate() {
    if (!form.userId.trim()) { notify("ต้องใส่ Discord User ID", "err"); return }
    if (!/^\d{17,20}$/.test(form.userId.trim())) { notify("User ID ต้องเป็น Discord snowflake (17-20 หลัก)", "err"); return }
    if (!form.expiresAt) { notify("ต้องเลือกวันหมดอายุ", "err"); return }
    const expiresDate = new Date(form.expiresAt)
    if (expiresDate <= new Date()) { notify("วันหมดอายุต้องเป็นอนาคต", "err"); return }

    startTransition(async () => {
      try {
        const { actionCreateDigitalOverride } = await import("@/app/admin/digital-override-actions")
        const res = await actionCreateDigitalOverride({
          userId: form.userId.trim(), roleName: form.roleName, expiresAt: expiresDate.toISOString(),
          note: form.note.trim() || undefined, confirmedByRoleId: form.confirmedByRoleId.trim() || null,
        })
        if (!res.ok) { notify(res.error, "err"); return }
        notify(`✓ สร้าง override สำเร็จ — ${form.roleName}`)
        setShowCreate(false)
        setForm({ userId: "", roleName: "69Bath", expiresAt: "", note: "", confirmedByRoleId: "", durationPreset: "7d" })
        loadOverrides()
      } catch (e) { notify((e as Error).message, "err") }
    })
  }

  function handleRevoke(ov: import("@/lib/types").DigitalRoleOverride) {
    startTransition(async () => {
      try {
        const { actionRevokeDigitalOverride } = await import("@/app/admin/digital-override-actions")
        const res = await actionRevokeDigitalOverride(ov.id)
        if (!res.ok) { notify((res as { error: string }).error, "err"); return }
        notify("✓ Revoke สำเร็จ"); setRevokeDialog(null); loadOverrides()
      } catch (e) { notify((e as Error).message, "err") }
    })
  }

  const now = new Date()
  const active  = overrides.filter(o => !o.is_superseded && new Date(o.expires_at) > now)
  const expired = overrides.filter(o => o.is_superseded || new Date(o.expires_at) <= now)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ color: C.text }} className="text-lg font-black flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs font-black shrink-0">⚡</span>
            Digital Role Override
          </div>
          <div style={{ color: C.textSub }} className="text-xs mt-1 max-w-xl">
            ให้ยศชั่วคราวก่อน Discord sync — เมื่อ user ได้ยศจริงแล้ว override จะถูก auto-supersede
          </div>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            showCreate
              ? "bg-white/5 text-white/50 hover:text-white border border-white/10"
              : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-900/30"
          }`}>
          {showCreate ? "✕ ยกเลิก" : "+ สร้าง Override"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon="⚡" label="Active" value={active.length} accent="text-violet-400" trend={active.length > 0 ? "up" : "neutral"} />
        <KpiCard icon="✓" label="Superseded" value={expired.filter(o => o.is_superseded).length} accent="text-emerald-400" />
        <KpiCard icon="⏱" label="Expired" value={expired.filter(o => !o.is_superseded).length} />
      </div>

      {showCreate && (
        <Card className="overflow-hidden" style={{ borderColor: "#4c1d95" }}>
          <div style={{ borderColor: C.border }} className="px-5 py-4 border-b bg-violet-900/10 flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-violet-600/40 flex items-center justify-center text-[10px] font-black text-violet-300">+</div>
            <span style={{ color: C.text }} className="text-sm font-bold">สร้าง Digital Override ใหม่</span>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <Label>Discord User ID *</Label>
              <Input value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}
                placeholder="เช่น 885473979098337310" className="w-full font-mono" />
            </div>
            <div>
              <Label>Role *</Label>
              <div className="flex gap-2 flex-wrap">
                {ROLES.map(r => (
                  <button key={r} onClick={() => setForm(f => ({ ...f, roleName: r }))}
                    style={{ borderColor: form.roleName === r ? ROLE_COLORS[r] : C.border, color: form.roleName === r ? ROLE_COLORS[r] : C.dim, backgroundColor: form.roleName === r ? ROLE_COLORS[r] + "22" : "transparent" }}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all">{r}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>Duration</Label>
              <div className="flex gap-2 flex-wrap mb-2">
                {presets.map(p => (
                  <button key={p.value} onClick={() => applyPreset(p)}
                    style={{ borderColor: form.durationPreset === p.value ? C.violet : C.border, color: form.durationPreset === p.value ? C.violet : C.dim, backgroundColor: form.durationPreset === p.value ? C.violetDim : "transparent" }}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all">{p.label}</button>
                ))}
              </div>
              {form.durationPreset === "custom" && (
                <Input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className="w-full" />
              )}
              {form.expiresAt && form.durationPreset !== "custom" && (
                <div style={{ color: C.muted }} className="text-xs mt-1">
                  หมดอายุ: {new Date(form.expiresAt).toLocaleString("th-TH")}
                </div>
              )}
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="เช่น โอนแล้ว slip#123" className="w-full" />
            </div>
            <div>
              <Label>Confirmed by Role ID (optional)</Label>
              <Input value={form.confirmedByRoleId} onChange={e => setForm(f => ({ ...f, confirmedByRoleId: e.target.value }))} placeholder="Discord Role ID" className="w-full font-mono" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleCreate} disabled={isPending}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition-all shadow shadow-violet-900/30">
                {isPending && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                สร้าง Override
              </button>
              <GhostBtn onClick={() => setShowCreate(false)}>ยกเลิก</GhostBtn>
            </div>
          </div>
        </Card>
      )}

      {/* Active overrides */}
      {active.length > 0 && (
        <div>
          <SectionTitle>⚡ Active Overrides</SectionTitle>
          <div className="space-y-3">
            {active.map(ov => {
              const daysLeft = Math.ceil((new Date(ov.expires_at).getTime() - now.getTime()) / 86400000)
              return (
                <Card key={ov.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <RoleBadge role={ov.role_name} />
                        <span style={{ color: C.muted }} className="text-[9px] font-mono">{ov.user_id}</span>
                        {daysLeft <= 3 && <span className="text-[9px] bg-amber-900/40 text-amber-400 border border-amber-700/30 px-1.5 py-0.5 rounded-full font-bold">{daysLeft}d left</span>}
                      </div>
                      {ov.note && <div style={{ color: C.muted }} className="text-xs">📝 {ov.note}</div>}
                      <div style={{ color: C.muted }} className="text-[9px]">
                        หมดอายุ {new Date(ov.expires_at).toLocaleString("th-TH")}
                        {ov.confirmed_by_role_id && ` · role: ${ov.confirmed_by_role_id}`}
                      </div>
                    </div>
                    <ActionBtn variant="red" onClick={() => setRevokeDialog(ov)}>Revoke</ActionBtn>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Expired / superseded */}
      {expired.length > 0 && (
        <div>
          <SectionTitle>📋 History</SectionTitle>
          <Card className="overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderColor: C.border, backgroundColor: C.bg }} className="border-b">
                  {["User ID", "Role", "Expired/Superseded", "Note", "Status"].map(h => (
                    <th key={h} style={{ color: C.dim }} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderColor: C.border }} className="divide-y">
                {expired.slice(0, 20).map(ov => (
                  <tr key={ov.id} className="hover:bg-white/2 opacity-60">
                    <td style={{ color: C.text }} className="px-4 py-2.5 font-mono">{ov.user_id.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5"><RoleBadge role={ov.role_name} /></td>
                    <td style={{ color: C.muted }} className="px-4 py-2.5">{new Date(ov.expires_at).toLocaleDateString("th-TH")}</td>
                    <td style={{ color: C.muted }} className="px-4 py-2.5">{ov.note ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ov.is_superseded ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-900/40 text-zinc-400"}`}>
                        {ov.is_superseded ? "Superseded" : "Expired"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {loading && <div style={{ color: C.muted }} className="text-sm py-8 text-center">Loading…</div>}
      {!loading && overrides.length === 0 && <div style={{ color: C.muted }} className="text-sm py-8 text-center">ยังไม่มี override</div>}

      {revokeDialog && (
        <ConfirmDialog
          title="Revoke Override?"
          message={`Revoke ${revokeDialog.role_name} for user ${revokeDialog.user_id}?`}
          confirmLabel="Revoke" danger
          onConfirm={() => handleRevoke(revokeDialog)}
          onCancel={() => setRevokeDialog(null)}
        />
      )}
    </div>
  )
}

// ─── Add User Tab ─────────────────────────────────────────────────────────────
function AddUserTab({ notify }: { notify: (msg: string, type?: "ok" | "err") => void }) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({ userId: "", username: "", note: "" })
  const [result, setResult] = useState<import("@/lib/types").AppUser | null>(null)
  const [history, setHistory] = useState<Array<{ userId: string; username: string; time: string }>>([])

  function handleAdd() {
    if (!form.userId.trim()) { notify("ต้องใส่ Discord User ID", "err"); return }
    if (!/^\d{17,20}$/.test(form.userId.trim())) { notify("User ID ต้องเป็น Discord snowflake (17-20 หลัก)", "err"); return }
    if (!form.username.trim()) { notify("ต้องใส่ Username", "err"); return }
    startTransition(async () => {
      try {
        const { actionAddUserManually } = await import("@/app/admin/actions")
        const res = await actionAddUserManually({ userId: form.userId.trim(), username: form.username.trim(), note: form.note.trim() || undefined })
        if (!res.ok) { notify((res as { error: string }).error, "err"); return }
        setResult(res.data)
        setHistory(h => [{ userId: form.userId.trim(), username: form.username.trim(), time: new Date().toLocaleString("th-TH") }, ...h.slice(0, 9)])
        notify(`✓ เพิ่ม user ${form.username} สำเร็จ`)
        setForm({ userId: "", username: "", note: "" })
      } catch (e) { notify((e as Error).message, "err") }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div style={{ color: C.text }} className="text-lg font-black flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black shrink-0">+</span>
          Add User Manually
        </div>
        <div style={{ color: C.textSub }} className="text-xs mt-1">
          เพิ่ม user เข้าระบบโดยตรง — ใช้ร่วมกับ Digital Override เพื่อให้ยศพร้อมกัน
        </div>
      </div>

      <div style={{ backgroundColor: "#1a1200", borderColor: "#78350f" }} className="flex gap-3 px-4 py-3 border rounded-xl text-xs text-amber-400">
        <span className="shrink-0 text-sm">⚠️</span>
        <div>
          <div className="font-bold mb-0.5">หมายเหตุสำคัญ</div>
          <div className="text-amber-400/70">User ที่เพิ่มแบบ manual จะไม่มี Avatar — roles จะ sync อัตโนมัติเมื่อ login ครั้งแรก</div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div style={{ borderColor: C.border }} className="px-5 py-4 border-b bg-emerald-900/10 flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-emerald-600/40 flex items-center justify-center text-[10px] font-black text-emerald-300">U</div>
          <span style={{ color: C.text }} className="text-sm font-bold">ข้อมูล User</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label>Discord User ID *</Label>
            <Input value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}
              placeholder="เช่น 885473979098337310" className="w-full font-mono" />
            <div style={{ color: C.muted }} className="text-[10px] mt-1">ดูได้จาก Discord → Developer Mode → คลิกขวา → Copy ID</div>
          </div>
          <div>
            <Label>Username *</Label>
            <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="Discord username" className="w-full" />
          </div>
          <div>
            <Label>Admin Note</Label>
            <Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              placeholder="เช่น เพิ่มมาจากใบสมัคร" className="w-full" />
          </div>
          {(form.userId || form.username) && (
            <div style={{ backgroundColor: C.bg, borderColor: C.border }} className="border rounded-xl px-4 py-3 flex items-center gap-3">
              <div style={{ backgroundColor: C.surface, color: C.muted }} className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {form.username ? form.username.charAt(0).toUpperCase() : "?"}
              </div>
              <div>
                <div style={{ color: C.text }} className="text-sm font-semibold">{form.username || "—"}</div>
                <div style={{ color: C.muted }} className="text-[9px] font-mono">{form.userId || "—"}</div>
                {form.note && <div style={{ color: C.textSub }} className="text-[9px] mt-0.5">📝 {form.note}</div>}
              </div>
            </div>
          )}
          <button onClick={handleAdd} disabled={isPending || !form.userId || !form.username}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all">
            {isPending
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลังเพิ่ม…</>
              : <>+ เพิ่ม User เข้าระบบ</>}
          </button>
        </div>
      </Card>

      {result && (
        <div style={{ backgroundColor: "#0a1e12", borderColor: "#14532d" }} className="border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-black text-white">✓</div>
            <span className="text-sm font-bold text-emerald-400">เพิ่ม User สำเร็จ!</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[["User ID", result.user_id], ["Username", result.username], ["First Login", new Date(result.first_login).toLocaleString("th-TH")], ["Status", "Active"]].map(([l, v]) => (
              <div key={l}><span style={{ color: C.muted }}>{l}:</span> <span style={{ color: C.text }}>{v}</span></div>
            ))}
          </div>
          <div style={{ borderColor: "#14532d", color: "rgba(52,211,153,0.6)" }} className="mt-3 pt-3 border-t text-[10px]">
            💡 ถ้าต้องการให้ยศทันที → ไปที่ Digital Override แล้วใส่ User ID นี้
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <SectionTitle>เพิ่งเพิ่มในเซสชันนี้</SectionTitle>
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.userId + h.time} style={{ backgroundColor: C.surface, borderColor: C.border }}
                className="flex items-center gap-3 px-3 py-2 border rounded-xl text-xs">
                <div style={{ backgroundColor: C.border, color: C.muted }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                  {h.username.charAt(0).toUpperCase()}
                </div>
                <span style={{ color: C.text }} className="font-semibold">{h.username}</span>
                <span style={{ color: C.muted }} className="font-mono">{h.userId}</span>
                <span style={{ color: C.muted }} className="ml-auto">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
