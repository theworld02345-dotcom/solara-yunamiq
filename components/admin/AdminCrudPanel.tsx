"use client"

/**
 * components/admin/AdminCrudPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin CRUD Panel — ครอบทุก operation:
 *   • Galleries: สร้าง / แก้ไข / ลบ / restore / pin / bulk-delete
 *   • Images: เพิ่ม / ลบ / เรียงลำดับ
 *   • Links: สร้าง / แก้ไข / ลบ
 *   • Tags: สร้าง / แก้ไข / ลบ
 *   • Users: ban / unban / ดู audit log
 *   • Announcement: banner / note
 *
 * วางไฟล์ที่: components/admin/AdminCrudPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition, useCallback, useEffect, useRef } from "react"
import type { Gallery, Tag, AppUser, GalleryLink, AuditEntry } from "@/lib/types"
import type {
  CreateGalleryInput,
  UpdateGalleryInput,
  CreateTagInput,
  AddLinkInput,
  UpdateLinkInput,
} from "@/lib/validate"
import GalleryUrlManager from "@/components/ui/GalleryUrlManager"
import {
  actionCreateGallery,
  actionUpdateGallery,
  actionDeleteGallery,
  actionBulkDeleteGalleries,
  actionTogglePin,
  actionAddImage,
  actionRemoveImage,
  actionCreateLink,
  actionUpdateLink,
  actionDeleteLink,
  actionCreateTag,
  actionUpdateTag,
  actionDeleteTag,
  actionBanUser,
  actionUnbanUser,
  actionGetAllGalleries,
  actionGetAllUsers,
  actionGetTags,
  actionGetUserAuditLog,
  actionSetBanner,
  actionAddUserManually,
  actionBulkAddImages,
} from "@/app/admin/actions"

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = "galleries" | "tags" | "users" | "announcement"
type GallerySubTab = "list" | "create" | "edit" | "images" | "links"

// ─── Toast ─────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([])
  const show = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts((t) => [...t, { id, msg, ok }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return { toasts, show }
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Toast({ toasts }: { toasts: { id: number; msg: string; ok: boolean }[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg border transition-all
            ${t.ok
              ? "bg-emerald-900/90 border-emerald-700 text-emerald-100"
              : "bg-red-900/90 border-red-700 text-red-100"
            }`}
        >
          {t.ok ? "✓" : "✗"} {t.msg}
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({
  msg,
  onConfirm,
  onCancel,
}: {
  msg: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <p className="text-zinc-100 text-sm mb-5">{msg}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
            ยกเลิก
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
}

function Badge({ children, color = "zinc" }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-700 text-zinc-300",
    emerald: "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
    red: "bg-red-900/60 text-red-300 border border-red-700",
    amber: "bg-amber-900/60 text-amber-300 border border-amber-700",
    blue: "bg-blue-900/60 text-blue-300 border border-blue-700",
    violet: "bg-violet-900/60 text-violet-300 border border-violet-700",
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color] ?? colors.zinc}`}>
      {children}
    </span>
  )
}

// ─── Gallery Form ──────────────────────────────────────────────────────────

// ─── Toggle Switch sub-component ───────────────────────────────────────────
function ToggleSwitch({
  checked,
  onChange,
  color = "blue",
}: {
  checked: boolean
  onChange: (v: boolean) => void
  color?: "blue" | "green"
}) {
  const track = checked
    ? color === "green"
      ? "bg-green-500"
      : "bg-blue-600"
    : "bg-zinc-700"
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${track}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  )
}

// ─── Gallery Form ───────────────────────────────────────────────────────────
function GalleryForm({
  initial,
  tags,
  onSubmit,
  isPending,
}: {
  initial?: Partial<Gallery>
  tags: Tag[]
  onSubmit: (input: CreateGalleryInput | UpdateGalleryInput) => void
  isPending: boolean
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  // ✅ FIX: ใช้ string[] ของ URL (GalleryUrlManager จัดการ GalleryImage[] ภายใน)
  const _initUrls = (initial?.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.url)
  const [imageUrls, setImageUrls] = useState<string[]>(_initUrls)
  // 🔧 FIX: useRef เก็บค่าล่าสุดเสมอ ป้องกัน stale closure ตอน handleSubmit
  const imageUrlsRef = useRef<string[]>(_initUrls)
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? [])
  const [minLevel, setMinLevel] = useState(initial?.access?.min_hierarchy_level ?? 1)
  const [minRoleName, setMinRoleName] = useState<
    "69Bath" | "99Bath" | "199Bath" | "299Bath" | "699Bath"
  >(initial?.access?.min_role_name ?? "69Bath")
  const [isPinned, setIsPinned] = useState(initial?.is_pinned ?? false)
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  const roleOptions = [
    { name: "69Bath" as const, level: 1 },
    { name: "99Bath" as const, level: 2 },
    { name: "199Bath" as const, level: 3 },
    { name: "299Bath" as const, level: 4 },
    { name: "699Bath" as const, level: 5 },
  ]

  // sync minLevel ตาม minRoleName อัตโนมัติ
  const handleRoleSelect = (name: typeof minRoleName, level: number) => {
    setMinRoleName(name)
    setMinLevel(level)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // 🔧 FIX: อ่านจาก ref เสมอ ป้องกัน stale closure ระหว่าง setState async
    const images = imageUrlsRef.current.filter(Boolean)

    if (initial?.id) {
      onSubmit({
        title,
        description,
        images,
        tags: selectedTags,
        minLevel,
        minRoleName,
        is_pinned: isPinned,
        is_active: isActive,
      } as UpdateGalleryInput)
    } else {
      onSubmit({
        title,
        description,
        images,
        tags: selectedTags,
        minLevel,
        minRoleName,
        isPinned,
      } as CreateGalleryInput)
    }
  }

  const inputCls =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
  const labelCls = "block text-xs font-semibold tracking-widest text-zinc-400 uppercase mb-2"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label className={labelCls}>Title *</label>
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Gallery name..."
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          className={inputCls + " min-h-[80px] resize-y"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
        />
      </div>

      {/* Thumbnail / Images — GalleryUrlManager จัดการทั้งหมด */}
      <div>
        <GalleryUrlManager
          label="Thumbnail URL"
          value={imageUrls}
          onChange={(urls) => {
            imageUrlsRef.current = urls
            setImageUrls(urls)
          }}
          maxImages={100}
          placeholder="/collection-thumb.jpg or https://..."
        />
      </div>

      {/* Min Role Required — pill buttons ตามรูป */}
      <div>
        <label className={labelCls}>Min Role Required</label>
        <div className="flex flex-wrap gap-2">
          {roleOptions.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => handleRoleSelect(r.name, r.level)}
              className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                minRoleName === r.name
                  ? "bg-amber-500/10 border-amber-500 text-amber-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className={labelCls}>
          Tags{" "}
          <span className="normal-case font-normal text-zinc-600">
            ({selectedTags.length} selected)
          </span>
        </label>
        {tags.filter((t) => t.is_active).length === 0 ? (
          <p className="text-xs text-zinc-600">No active tags</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.filter((t) => t.is_active).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                  )
                }
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedTags.includes(t.id)
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {t.display}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pinned / Active toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <ToggleSwitch checked={isPinned} onChange={setIsPinned} color="blue" />
          <span className="text-sm text-zinc-300">📌 {initial?.id ? "Pinned" : "Pin this gallery"}</span>
        </label>
        {initial?.id && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <ToggleSwitch checked={isActive} onChange={setIsActive} color="green" />
            <span className="text-sm text-zinc-300">Active</span>
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {isPending && <Spinner />}
        {initial?.id ? "Save Changes" : "Create Gallery"}
      </button>
    </form>
  )
}

// ─── Link Form ─────────────────────────────────────────────────────────────

function LinkForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial?: Partial<GalleryLink>
  onSubmit: (data: AddLinkInput | UpdateLinkInput) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? "")
  const [url, setUrl] = useState(initial?.url ?? "")
  const [copyLimit, setCopyLimit] = useState(initial?.copy_limit_per_user ?? 3)
  const [minLevel, setMinLevel] = useState(initial?.accessible_by_min_level ?? 1)
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  /** bulk image URLs — 1 บรรทัด = 1 URL (ใช้เฉพาะตอนสร้างใหม่) */
  const [imageUrlsRaw, setImageUrlsRaw] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (initial?.id) {
      onSubmit({ label, url, copy_limit_per_user: copyLimit, accessible_by_min_level: minLevel, is_active: isActive })
    } else {
      // ✅ v3.5: AddLinkSchema.imageUrls = z.array() → split raw textarea เป็น string[] ก่อนส่ง
      const imageUrls = imageUrlsRaw
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      onSubmit({ label, url, copyLimit, minLevel, imageUrls })
    }
  }

  const inputCls =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" required />
      <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Copy limit</label>
          <input
            type="number"
            className={inputCls}
            value={copyLimit}
            onChange={(e) => setCopyLimit(Number(e.target.value))}
            min={0}
            max={9999}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Min Level</label>
          <select className={inputCls} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Level {l}</option>)}
          </select>
        </div>
      </div>
      {/* ── Image URLs (สร้างใหม่เท่านั้น) ── */}
      {!initial?.id && (
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">
            รูป Link{" "}
            <span className="text-zinc-600">— 1 บรรทัด = 1 รูป (ส่งใน Discord embed)</span>
          </label>
          <textarea
            className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`}
            rows={4}
            value={imageUrlsRaw}
            onChange={(e) => setImageUrlsRaw(e.target.value)}
            placeholder={"https://i.imgur.com/abc.jpg\nhttps://i.imgur.com/def.jpg"}
          />
          {imageUrlsRaw.trim() && (
            <p className="mt-1 text-[10px] text-zinc-500">
              {imageUrlsRaw.split("\n").filter((s) => s.trim()).length} รูป
            </p>
          )}
        </div>
      )}
      {initial?.id && (
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg"
      >
        {isPending && <Spinner />}
        {initial?.id ? "บันทึก" : "เพิ่ม Link"}
      </button>
    </form>
  )
}

// ─── Galleries Tab ─────────────────────────────────────────────────────────

function GalleriesTab({
  toast,
}: {
  toast: (msg: string, ok?: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [subTab, setSubTab] = useState<GallerySubTab>("list")
  const [editTarget, setEditTarget] = useState<Gallery | null>(null)
  const [imageTarget, setImageTarget] = useState<Gallery | null>(null)
  const [linkTarget, setLinkTarget] = useState<Gallery | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => void } | null>(null)
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([])
  const [bulkPasteText, setBulkPasteText] = useState<string>("")
  const [bulkPasteMode, setBulkPasteMode] = useState<boolean>(false)
  const [editLink, setEditLink] = useState<GalleryLink | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([actionGetAllGalleries(), actionGetTags()]).then(([g, t]) => {
      if (g.ok) setGalleries(g.data)
      if (t.ok) setTags(t.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  // ── Gallery CRUD ────────────────────────────────────────────────────────

  function handleCreate(input: CreateGalleryInput) {
    startTransition(async () => {
      const r = await actionCreateGallery(input)
      if (r.ok) { toast("สร้าง gallery สำเร็จ"); load(); setSubTab("list") }
      else toast(r.error, false)
    })
  }

  function handleUpdate(input: UpdateGalleryInput) {
    if (!editTarget) return
    startTransition(async () => {
      const r = await actionUpdateGallery(editTarget.id, input)
      if (r.ok) { toast("บันทึกสำเร็จ"); load(); setSubTab("list") }
      else toast(r.error, false)
    })
  }

  function handleDelete(g: Gallery) {
    setConfirm({
      msg: `ลบ "${g.title}" ออกจากระบบ? ข้อมูลจะหายถาวร ไม่สามารถกู้คืนได้`,
      fn: () => {
        setConfirm(null)
        startTransition(async () => {
          // hard = true → ลบแถวออกจาก Supabase จริง ไม่ใช่แค่ซ่อน
          const r = await actionDeleteGallery(g.id, true)
          if (r.ok) { toast("ลบแล้ว"); load() }
          else toast(r.error, false)
        })
      },
    })
  }

  function handleTogglePin(g: Gallery) {
    startTransition(async () => {
      const r = await actionTogglePin(g.id)
      if (r.ok) { toast(r.data ? "ปักหมุดแล้ว" : "ยกเลิกหมุดแล้ว"); load() }
      else toast(r.error, false)
    })
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    setConfirm({
      msg: `ลบ ${selected.size} gallery ที่เลือกออกจากระบบ? ข้อมูลจะหายถาวร`,
      fn: () => {
        setConfirm(null)
        startTransition(async () => {
          // hard = true ทุกครั้ง
          const r = await actionBulkDeleteGalleries(Array.from(selected), true)
          if (r.ok) { toast(`ลบ ${r.data.deleted} รายการสำเร็จ`); setSelected(new Set()); load() }
          else toast(r.error, false)
        })
      },
    })
  }

  // ── Image CRUD ──────────────────────────────────────────────────────────

  async function refreshImageTarget(galleryId: string) {
    const fresh = await actionGetAllGalleries()
    if (fresh.ok) {
      const g = fresh.data.find((x) => x.id === galleryId)
      if (g) setImageTarget(g)
    }
  }

  function handleAddImages() {
    if (!imageTarget || pendingImageUrls.length === 0) return
    const targetId = imageTarget.id
    startTransition(async () => {
      const r = await actionBulkAddImages(targetId, pendingImageUrls)
      if (r.ok) {
        toast(`เพิ่ม ${r.data.added} รูปสำเร็จ${r.data.failed > 0 ? ` (ข้าม ${r.data.failed} URL ไม่ถูกต้อง/ซ้ำ)` : ""}`)
        setPendingImageUrls([])
        load()
        await refreshImageTarget(targetId)
      } else toast(r.error, false)
    })
  }

  function handleRemoveImage(imageId: string) {
    if (!imageTarget) return
    startTransition(async () => {
      const r = await actionRemoveImage(imageTarget.id, imageId)
      if (r.ok) {
        toast("ลบรูปแล้ว")
        load()
        await refreshImageTarget(imageTarget.id)
      } else toast(r.error, false)
    })
  }

  // ── Link CRUD ───────────────────────────────────────────────────────────

  function handleCreateLink(input: AddLinkInput) {
    if (!linkTarget) return
    startTransition(async () => {
      const r = await actionCreateLink(linkTarget.id, input)
      if (r.ok) {
        toast("สร้าง link สำเร็จ")
        load()
        const fresh = await actionGetAllGalleries()
        if (fresh.ok) {
          const g = fresh.data.find((x) => x.id === linkTarget.id)
          if (g) setLinkTarget(g)
        }
      } else toast(r.error, false)
    })
  }

  function handleUpdateLink(input: UpdateLinkInput) {
    if (!linkTarget || !editLink) return
    startTransition(async () => {
      const r = await actionUpdateLink(linkTarget.id, editLink.id, input)
      if (r.ok) {
        toast("อัปเดต link แล้ว")
        setEditLink(null)
        load()
        const fresh = await actionGetAllGalleries()
        if (fresh.ok) {
          const g = fresh.data.find((x) => x.id === linkTarget.id)
          if (g) setLinkTarget(g)
        }
      } else toast(r.error, false)
    })
  }

  function handleDeleteLink(linkId: string) {
    if (!linkTarget) return
    startTransition(async () => {
      const r = await actionDeleteLink(linkTarget.id, linkId)
      if (r.ok) {
        toast("ลบ link แล้ว")
        load()
        const fresh = await actionGetAllGalleries()
        if (fresh.ok) {
          const g = fresh.data.find((x) => x.id === linkTarget.id)
          if (g) setLinkTarget(g)
        }
      } else toast(r.error, false)
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const btnBase = "px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"

  // Sub-nav
  function SubNav() {
    const items: { key: GallerySubTab; label: string }[] = [
      { key: "list", label: "รายการ" },
      { key: "create", label: "+ สร้างใหม่" },
      ...(editTarget ? [{ key: "edit" as GallerySubTab, label: `✏ ${editTarget.title.slice(0, 16)}…` }] : []),
      ...(imageTarget ? [{ key: "images" as GallerySubTab, label: `🖼 ${imageTarget.title.slice(0, 12)}…` }] : []),
      ...(linkTarget ? [{ key: "links" as GallerySubTab, label: `🔗 ${linkTarget.title.slice(0, 12)}…` }] : []),
    ]
    return (
      <div className="flex gap-2 flex-wrap mb-4">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => setSubTab(i.key)}
            className={`${btnBase} ${subTab === i.key ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
          >
            {i.label}
          </button>
        ))}
      </div>
    )
  }

  if (loading) return <div className="flex items-center gap-2 text-zinc-400 text-sm py-8"><Spinner /> กำลังโหลด...</div>

  return (
    <div>
      <SubNav />

      {/* ── LIST ─────────────────────────────────────────────────────────── */}
      {subTab === "list" && (
        <div>
          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
              <span className="text-sm text-zinc-300">{selected.size} รายการ</span>
              <button onClick={() => handleBulkDelete()} className={`${btnBase} bg-red-700 hover:bg-red-600 text-white`}>
                🗑 ลบทั้งหมด
              </button>
              <button onClick={() => setSelected(new Set())} className={`${btnBase} bg-zinc-700 text-zinc-300`}>
                ยกเลิก
              </button>
            </div>
          )}

          <div className="space-y-2">
            {galleries.map((g) => (
              <div
                key={g.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  g.is_active ? "bg-zinc-800/50 border-zinc-700" : "bg-red-900/10 border-red-900/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={(e) => {
                    const s = new Set(selected)
                    e.target.checked ? s.add(g.id) : s.delete(g.id)
                    setSelected(s)
                  }}
                  className="mt-0.5"
                />

                {/* Thumbnail */}
                {g.images?.[0]?.url && (
                  <img
                    src={g.images[0].url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-zinc-700"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-100 truncate">{g.title}</span>
                    {g.is_pinned && <Badge color="amber">📌 ปักหมุด</Badge>}
                    {!g.is_active && <Badge color="red">ซ่อน</Badge>}
                    <Badge color="zinc">{g.images?.length ?? 0} รูป</Badge>
                    <Badge color="zinc">{g.links?.length ?? 0} link</Badge>
                    <Badge color="blue">Lv.{g.access.min_hierarchy_level}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{g.description || "ไม่มีคำอธิบาย"}</p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => { setEditTarget(g); setSubTab("edit") }}
                    className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
                  >
                    ✏ แก้ไข
                  </button>
                  <button
                    onClick={() => { setImageTarget(g); setSubTab("images") }}
                    className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
                  >
                    🖼 รูป
                  </button>
                  <button
                    onClick={() => { setLinkTarget(g); setSubTab("links") }}
                    className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
                  >
                    🔗 Link
                  </button>
                  <button
                    onClick={() => handleTogglePin(g)}
                    disabled={isPending}
                    className={`${btnBase} ${g.is_pinned ? "bg-amber-800 hover:bg-amber-700 text-amber-200" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"}`}
                  >
                    {g.is_pinned ? "📌" : "📍"}
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
                    disabled={isPending}
                    className={`${btnBase} bg-red-900/60 hover:bg-red-800 text-red-300`}
                  >
                    🗑 ลบ
                  </button>
                </div>
              </div>
            ))}
            {galleries.length === 0 && (
              <p className="text-zinc-500 text-sm py-8 text-center">ยังไม่มี gallery</p>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE ────────────────────────────────────────────────────────── */}
      {subTab === "create" && (
        <div className="max-w-xl">
          <GalleryForm tags={tags} onSubmit={handleCreate as (i: CreateGalleryInput | UpdateGalleryInput) => void} isPending={isPending} />
        </div>
      )}

      {/* ── EDIT ──────────────────────────────────────────────────────────── */}
      {subTab === "edit" && editTarget && (
        <div className="max-w-xl">
          <GalleryForm
            initial={editTarget}
            tags={tags}
            onSubmit={handleUpdate as (i: CreateGalleryInput | UpdateGalleryInput) => void}
            isPending={isPending}
          />
        </div>
      )}

      {/* ── IMAGES ────────────────────────────────────────────────────────── */}
      {subTab === "images" && imageTarget && (
        <div className="max-w-xl space-y-4">
          <h3 className="text-sm font-medium text-zinc-200">
            รูปภาพใน "{imageTarget.title}" ({imageTarget.images?.length ?? 0} รูป)
          </h3>

          {/* Add images — toggle between URL manager and bulk paste */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkPasteMode(false)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${!bulkPasteMode ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"}`}
              >
                URL ทีละรายการ
              </button>
              <button
                onClick={() => setBulkPasteMode(true)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${bulkPasteMode ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"}`}
              >
                📋 Bulk Paste (หลาย URL พร้อมกัน)
              </button>
            </div>

            {!bulkPasteMode ? (
              <GalleryUrlManager
                label="เพิ่มรูปใหม่"
                value={pendingImageUrls}
                onChange={setPendingImageUrls}
                maxImages={100}
                placeholder="https://i.imgur.com/xxx.jpg"
              />
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">วาง URLs ทีละบรรทัด (รองรับสูงสุด 100 URLs)</p>
                <textarea
                  value={bulkPasteText}
                  onChange={(e) => setBulkPasteText(e.target.value)}
                  rows={6}
                  placeholder={"https://i.imgur.com/abc.jpg\nhttps://i.postimg.cc/xyz.png\nhttps://..."}
                  className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 font-mono resize-y"
                />
                <p className="text-xs text-zinc-500">
                  {bulkPasteText.split("\n").filter((u) => u.trim()).length} URLs ที่พบ
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (bulkPasteMode) {
                  const urls = bulkPasteText.split("\n").map((u) => u.trim()).filter(Boolean)
                  if (!imageTarget || urls.length === 0) return
                  const targetId = imageTarget.id
                  startTransition(async () => {
                    const r = await actionBulkAddImages(targetId, urls)
                    if (r.ok) {
                      toast(`เพิ่ม ${r.data.added} รูปสำเร็จ${r.data.failed > 0 ? ` (ข้าม ${r.data.failed} URL ไม่ถูกต้อง/ซ้ำ)` : ""}`)
                      setBulkPasteText("")
                      load()
                      await refreshImageTarget(targetId)
                    } else toast(r.error, false)
                  })
                } else {
                  handleAddImages()
                }
              }}
              disabled={isPending || (bulkPasteMode ? !bulkPasteText.trim() : pendingImageUrls.length === 0)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {isPending && <Spinner />}
              {bulkPasteMode
                ? `เพิ่ม ${bulkPasteText.split("\n").filter((u) => u.trim()).length || 0} URLs`
                : `เพิ่ม ${pendingImageUrls.length > 0 ? pendingImageUrls.length : ""} รูป`}
            </button>
          </div>

          {/* Image list */}
          <div className="space-y-2">
            {(imageTarget.images ?? [])
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((img, idx) => (
                <div key={img.id} className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-lg p-2">
                  <span className="text-xs text-zinc-500 w-5">{idx + 1}</span>
                  <img src={img.url} alt="" className="w-12 h-12 object-cover rounded-lg border border-zinc-700" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400 truncate">{img.url}</p>
                    {img.caption && <p className="text-xs text-zinc-500 truncate">{img.caption}</p>}
                  </div>
                  <button
                    onClick={() => handleRemoveImage(img.id)}
                    disabled={isPending}
                    className={`${btnBase} bg-red-900/60 hover:bg-red-800 text-red-300`}
                  >
                    ลบ
                  </button>
                </div>
              ))}
            {(imageTarget.images ?? []).length === 0 && (
              <p className="text-zinc-500 text-xs text-center py-4">ยังไม่มีรูป</p>
            )}
          </div>
        </div>
      )}

      {/* ── LINKS ─────────────────────────────────────────────────────────── */}
      {subTab === "links" && linkTarget && (
        <div className="max-w-xl space-y-4">
          <h3 className="text-sm font-medium text-zinc-200">
            Links ใน "{linkTarget.title}" ({linkTarget.links?.length ?? 0} link)
          </h3>

          {/* Existing links */}
          <div className="space-y-2">
            {(linkTarget.links ?? []).map((link) => (
              <div key={link.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                {editLink?.id === link.id ? (
                  <LinkForm
                    initial={link}
                    onSubmit={(input) => handleUpdateLink(input as UpdateLinkInput)}
                    isPending={isPending}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-zinc-200 font-medium">{link.label}</span>
                        {link.is_active ? <Badge color="emerald">active</Badge> : <Badge color="red">inactive</Badge>}
                        <Badge color="zinc">Lv.{link.accessible_by_min_level}</Badge>
                        <Badge color="zinc">limit {link.copy_limit_per_user}</Badge>
                        <Badge color="zinc">{link.total_copies} copies</Badge>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{link.url}</p>
                    </div>
                    <button onClick={() => setEditLink(link)} className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}>
                      ✏
                    </button>
                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      disabled={isPending}
                      className={`${btnBase} bg-red-900/60 hover:bg-red-800 text-red-300`}
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add link */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
            <h4 className="text-xs font-medium text-zinc-400 mb-3">+ เพิ่ม Link ใหม่</h4>
            <LinkForm onSubmit={(input) => handleCreateLink(input as AddLinkInput)} isPending={isPending} />
          </div>
        </div>
      )}

      {confirm && <ConfirmDialog msg={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

// ─── Tags Tab ──────────────────────────────────────────────────────────────

function TagsTab({ toast }: { toast: (msg: string, ok?: boolean) => void }) {
  const [isPending, startTransition] = useTransition()
  const [tags, setTags] = useState<Tag[]>([])
  const [editTag, setEditTag] = useState<Tag | null>(null)
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => void } | null>(null)
  const [form, setForm] = useState({ name: "", display: "", color: "" })
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    actionGetTags().then((r) => {
      if (r.ok) setTags(r.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await actionCreateTag(form as CreateTagInput)
      if (r.ok) { toast("สร้าง tag สำเร็จ"); setForm({ name: "", display: "", color: "" }); load() }
      else toast(r.error, false)
    })
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editTag) return
    startTransition(async () => {
      const r = await actionUpdateTag(editTag.id, {
        name: editTag.name,
        display: editTag.display,
        color: editTag.color,
        is_active: editTag.is_active,
      })
      if (r.ok) { toast("อัปเดตสำเร็จ"); setEditTag(null); load() }
      else toast(r.error, false)
    })
  }

  function handleDelete(tag: Tag) {
    setConfirm({
      msg: `ลบ tag "${tag.display}"? จะถูกลบออกจาก ${tag.gallery_count} galleries`,
      fn: () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await actionDeleteTag(tag.id)
          if (r.ok) { toast("ลบสำเร็จ"); load() }
          else toast(r.error, false)
        })
      },
    })
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"

  if (loading) return <div className="flex items-center gap-2 text-zinc-400 text-sm py-8"><Spinner /> กำลังโหลด...</div>

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 max-w-md">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">+ สร้าง Tag ใหม่</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <input className={inputCls} placeholder="name (a-z, 0-9, -)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={inputCls} placeholder="Display Name" value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value })} required />
          <input className={inputCls} placeholder="color (hex หรือ tailwind class)" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} required />
          <button type="submit" disabled={isPending} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {isPending && <Spinner />}
            สร้าง Tag
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-2">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            {editTag?.id === tag.id ? (
              <form onSubmit={handleUpdate} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input className={inputCls} value={editTag.name} onChange={(e) => setEditTag({ ...editTag, name: e.target.value })} />
                  <input className={inputCls} value={editTag.display} onChange={(e) => setEditTag({ ...editTag, display: e.target.value })} />
                  <input className={inputCls} value={editTag.color} onChange={(e) => setEditTag({ ...editTag, color: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={editTag.is_active} onChange={(e) => setEditTag({ ...editTag, is_active: e.target.checked })} />
                  Active
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={isPending} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-1.5 rounded-lg">
                    {isPending && <Spinner />} บันทึก
                  </button>
                  <button type="button" onClick={() => setEditTag(null)} className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded-lg">
                    ยกเลิก
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 font-medium">{tag.display}</span>
                    <code className="text-xs bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-400">{tag.name}</code>
                    {!tag.is_active && <Badge color="red">inactive</Badge>}
                    <Badge color="zinc">{tag.gallery_count} galleries</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{tag.color}</p>
                </div>
                <button onClick={() => setEditTag(tag)} className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg">
                  ✏
                </button>
                <button onClick={() => handleDelete(tag)} disabled={isPending} className="px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 rounded-lg">
                  ลบ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {confirm && <ConfirmDialog msg={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

// ─── Users Tab ─────────────────────────────────────────────────────────────

function UsersTab({ toast }: { toast: (msg: string, ok?: boolean) => void }) {
  const [isPending, startTransition] = useTransition()
  const [users, setUsers] = useState<AppUser[]>([])
  const [banReason, setBanReason] = useState<Record<string, string>>({})
  const [auditUser, setAuditUser] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => void } | null>(null)
  const [addForm, setAddForm] = useState({ userId: "", username: "" })
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    actionGetAllUsers().then((r) => {
      if (r.ok) setUsers(r.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  function handleBan(user: AppUser) {
    const reason = banReason[user.user_id]?.trim()
    if (!reason) { toast("กรุณาระบ��เหตุผลการแบน", false); return }
    setConfirm({
      msg: `แบน "${user.username}"? เหตุผล: ${reason}`,
      fn: () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await actionBanUser(user.user_id, reason)
          if (r.ok) { toast("แบนแล้ว"); load() }
          else toast(r.error, false)
        })
      },
    })
  }

  function handleUnban(user: AppUser) {
    setConfirm({
      msg: `ปลดแบน "${user.username}"?`,
      fn: () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await actionUnbanUser(user.user_id)
          if (r.ok) { toast("ปลดแบนแล้ว"); load() }
          else toast(r.error, false)
        })
      },
    })
  }

  function handleViewAudit(userId: string) {
    setAuditUser(userId)
    actionGetUserAuditLog(userId).then((r) => {
      if (r.ok) setAuditLogs(r.data)
    })
  }

  function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await actionAddUserManually(addForm)
      if (r.ok) {
        toast(`เพิ่ม ${r.data.username} (${r.data.user_id}) สำเร็จ`)
        setAddForm({ userId: "", username: "" })
        setShowAddForm(false)
        load()
      } else {
        toast(r.error, false)
      }
    })
  }

  const btnBase = "px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"

  if (loading) return <div className="flex items-center gap-2 text-zinc-400 text-sm py-8"><Spinner /> กำลังโหลด...</div>

  return (
    <div className="space-y-6">
      {/* ── Add User ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-300">จัดการ Users</h3>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={`${btnBase} ${showAddForm ? "bg-zinc-700 text-zinc-300" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
          >
            {showAddForm ? "✕ ยกเลิก" : "+ เพิ่ม User"}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddUser} className="space-y-3 pt-1 border-t border-zinc-700">
            <p className="text-xs text-zinc-500 pt-2">
              เพิ่ม user ด้วย Discord User ID โดยตรง — ใช้สำหรับกรณีที่ยังไม่เคย login
              เช่น pre-assign Digital Override หรือ ban ล่วงหน้า
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Discord User ID <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 font-mono"
                  placeholder="885473979098337310"
                  value={addForm.userId}
                  onChange={(e) => setAddForm({ ...addForm, userId: e.target.value.trim() })}
                  pattern="\d{17,20}"
                  title="ตัวเลข 17-20 หลัก"
                  required
                />
                <p className="text-xs text-zinc-600 mt-1">ตัวเลข 17-20 หลัก (Discord snowflake)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                  placeholder="ชื่อ user (ชั่วคราว)"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  required
                />
                <p className="text-xs text-zinc-600 mt-1">จะถูกอัปเดตอัตโนมัติเมื่อ login จริง</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isPending || !addForm.userId || !addForm.username.trim()}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {isPending && <Spinner />}
                เพิ่ม User
              </button>
              <p className="text-xs text-zinc-500">
                login_count จะเป็น 0 — ระบบจะ sync ยศอัตโนมัติเมื่อ login ครั้งแรก
              </p>
            </div>
          </form>
        )}
      </div>

      {/* ── Audit Log drawer ──────────────────────────────────────────────── */}
      {auditUser && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-200">Audit Log</h3>
            <button onClick={() => setAuditUser(null)} className="text-xs text-zinc-400 hover:text-zinc-200">✕ ปิด</button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {auditLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 text-xs text-zinc-400 border-b border-zinc-700/50 pb-1">
                <span className="text-zinc-500 flex-shrink-0 font-mono">
                  {new Date(log.timestamp).toLocaleString("th-TH")}
                </span>
                <span className="text-violet-400 font-medium">{log.action}</span>
                {log.gallery_id && <span className="text-zinc-500">gallery: {log.gallery_id.slice(0, 8)}…</span>}
              </div>
            ))}
            {auditLogs.length === 0 && <p className="text-zinc-500 text-xs">ไม่มี log</p>}
          </div>
        </div>
      )}

      {users.map((user) => (
        <div
          key={user.user_id}
          className={`flex items-start gap-3 p-3 rounded-lg border ${
            user.is_banned ? "bg-red-900/10 border-red-900/40" : "bg-zinc-800/50 border-zinc-700"
          }`}
        >
          {user.avatar && <img src={`https://cdn.discordapp.com/avatars/${user.user_id}/${user.avatar}.webp?size=64`} className="w-10 h-10 rounded-full border border-zinc-700 flex-shrink-0" alt="" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-100">{user.username}</span>
              <span className="text-xs text-zinc-500">{user.discord_tag}</span>
              {user.is_banned && <Badge color="red">🚫 Banned</Badge>}
              {user.roles_cache.active_roles.map((r) => (
                <Badge key={r} color="violet">{r}</Badge>
              ))}
            </div>
            <div className="flex gap-4 mt-1 text-xs text-zinc-500">
              <span>Login: {user.login_count} ครั้ง</span>
              <span>Last: {new Date(user.last_login).toLocaleDateString("th-TH")}</span>
            </div>
            {user.is_banned && (
              <p className="text-xs text-red-400 mt-1">เหตุผล: {user.ban_reason}</p>
            )}
            {/* Ban reason input */}
            {!user.is_banned && (
              <input
                className="mt-2 w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                placeholder="เหตุผลการแบน..."
                value={banReason[user.user_id] ?? ""}
                onChange={(e) => setBanReason({ ...banReason, [user.user_id]: e.target.value })}
              />
            )}
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={() => handleViewAudit(user.user_id)} className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}>
              Log
            </button>
            {user.is_banned ? (
              <button onClick={() => handleUnban(user)} disabled={isPending} className={`${btnBase} bg-emerald-800 hover:bg-emerald-700 text-emerald-200`}>
                ปลดแบน
              </button>
            ) : (
              <button onClick={() => handleBan(user)} disabled={isPending} className={`${btnBase} bg-red-800 hover:bg-red-700 text-red-200`}>
                🚫 แบน
              </button>
            )}
          </div>
        </div>
      ))}

      {confirm && <ConfirmDialog msg={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

// ─── Announcement Tab ──────────────────────────────────────────────────────

function AnnouncementTab({ toast }: { toast: (msg: string, ok?: boolean) => void }) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState("")
  const [type, setType] = useState<"info" | "warning" | "success">("info")

  function handleSetBanner() {
    startTransition(async () => {
      const r = await actionSetBanner(
        msg.trim() ? { message: msg.trim(), type, created_at: new Date().toISOString() } : null
      )
      if (r.ok) toast(msg.trim() ? "ตั้ง banner แล้ว" : "ลบ banner แล้ว")
      else toast(r.error, false)
    })
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Announcement Banner</h3>
        <textarea
          className={inputCls + " min-h-[80px] resize-y"}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="ข้อความ banner (ว่างเพื่อลบ)"
        />
        <div className="flex gap-3">
          {(["info", "warning", "success"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
              <input type="radio" checked={type === t} onChange={() => setType(t)} />
              {t}
            </label>
          ))}
        </div>
        <button
          onClick={handleSetBanner}
          disabled={isPending}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {isPending && <Spinner />}
          {msg.trim() ? "ตั้ง Banner" : "ลบ Banner"}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function AdminCrudPanel() {
  const [tab, setTab] = useState<Tab>("galleries")
  const { toasts, show: toast } = useToast()

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "galleries", label: "Galleries", icon: "🖼" },
    { key: "tags", label: "Tags", icon: "🏷" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "announcement", label: "Announcement", icon: "📢" },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-100">Admin Panel</h1>
          <p className="text-sm text-zinc-500 mt-1">จัดการ Galleries, Tags, Users และ Announcement</p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 p-1 rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-violet-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          {tab === "galleries" && <GalleriesTab toast={toast} />}
          {tab === "tags" && <TagsTab toast={toast} />}
          {tab === "users" && <UsersTab toast={toast} />}
          {tab === "announcement" && <AnnouncementTab toast={toast} />}
        </div>
      </div>

      <Toast toasts={toasts} />
    </div>
  )
}
