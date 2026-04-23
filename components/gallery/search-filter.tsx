"use client"

import { Eye, EyeOff, Filter, Heart, Search, ShieldCheck, X, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { Tag } from "@/lib/types"

export type SortOrder = "newest" | "oldest"

export interface Filters {
  query: string
  tags: string[]
  sort: SortOrder
  accessibleOnly: boolean
  favoritesOnly: boolean
  blurImages: boolean
}

interface SearchFilterProps {
  filters: Filters
  onFiltersChange: (next: Filters) => void
  tags: Tag[]
  showFavoritesOption?: boolean
  showAccessibleOption?: boolean
}

export function SearchFilter({
  filters,
  onFiltersChange,
  tags,
  showFavoritesOption = true,
  showAccessibleOption = true,
}: SearchFilterProps) {
  const activeCount =
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.accessibleOnly ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0) +
    (filters.sort !== "newest" ? 1 : 0) +
    (filters.blurImages ? 1 : 0)

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const toggleTag = (name: string) => {
    const has = filters.tags.includes(name)
    update("tags", has ? filters.tags.filter((t) => t !== name) : [...filters.tags, name])
  }

  const clearAll = () => {
    onFiltersChange({ query: filters.query, tags: [], sort: "newest", accessibleOnly: false, favoritesOnly: false, blurImages: false })
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Search + filter row */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
          <Input
            type="search"
            placeholder="ค้นหา gallery..."
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
            className="pl-8 h-9 rounded-xl bg-zinc-800/80 border-white/8 text-white/90
              placeholder:text-zinc-600 focus-visible:border-white/20 focus-visible:bg-zinc-800 text-sm"
            aria-label="Search galleries"
          />
        </div>

        {/* Blur quick-toggle button */}
        <button
          type="button"
          onClick={() => update("blurImages", !filters.blurImages)}
          aria-label={filters.blurImages ? "ปิดเบลอรูป" : "เปิดเบลอรูป"}
          title={filters.blurImages ? "ปิดเบลอรูป" : "เบลอรูปทั้งหมด"}
          className={cn(
            "shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-all border",
            filters.blurImages
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-zinc-800 border-white/8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700",
          )}
        >
          {filters.blurImages ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>

        {/* Filter button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              className={cn(
                "rounded-xl gap-1.5 font-semibold h-9 px-3 text-sm",
                activeCount > 0
                  ? "bg-white text-zinc-900 hover:bg-white/90"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/8",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Filter
              {activeCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1
                  rounded-full bg-zinc-900 text-white text-[10px] font-bold leading-none">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] p-0 overflow-hidden bg-zinc-900 border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-zinc-400" />
                <h3 className="font-bold text-sm text-white">ตัวกรอง</h3>
              </div>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X className="size-3" />ล้างทั้งหมด
                </button>
              )}
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Sort */}
              <section>
                <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  จัดเรียง
                </Label>
                <RadioGroup
                  value={filters.sort}
                  onValueChange={(v) => update("sort", v as SortOrder)}
                  className="flex gap-2 mt-2"
                >
                  {[
                    { value: "newest", label: "ใหม่สุด" },
                    { value: "oldest", label: "เก่าสุด" },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 cursor-pointer py-1.5 rounded-lg border text-xs font-medium transition-all",
                        filters.sort === value
                          ? "bg-white/10 border-white/25 text-white"
                          : "border-white/8 text-zinc-500 hover:border-white/15 hover:text-zinc-300",
                      )}
                    >
                      <RadioGroupItem value={value} id={`sort-${value}`} className="sr-only" />
                      {label}
                    </label>
                  ))}
                </RadioGroup>
              </section>

              <Separator className="bg-white/8" />

              {/* Tags */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">แท็ก</Label>
                  <span className="text-[10px] text-zinc-600">OR</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 && (
                    <span className="text-xs text-zinc-600">ยังไม่มีแท็ก</span>
                  )}
                  {tags.map((t) => {
                    const selected = filters.tags.includes(t.name)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.name)}
                        aria-pressed={selected}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1",
                          selected
                            ? "bg-white text-zinc-900 border-white"
                            : "bg-zinc-800 text-zinc-400 border-white/8 hover:border-white/20 hover:text-zinc-200",
                        )}
                      >
                        {t.display}
                        <span className={cn("text-[10px] font-normal", selected ? "text-zinc-600" : "text-zinc-600")}>
                          {t.gallery_count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <Separator className="bg-white/8" />

              {/* Switches */}
              <section className="flex flex-col gap-3">
                {showAccessibleOption && (
                  <SwitchRow
                    icon={<ShieldCheck className="size-4 text-blue-400" />}
                    label="เฉพาะที่เข้าถึงได้"
                    sub="ตาม Role ของคุณ"
                    checked={filters.accessibleOnly}
                    onChange={(v) => update("accessibleOnly", v)}
                    ariaLabel="เฉพาะที่เข้าถึงได้"
                  />
                )}
                {showFavoritesOption && (
                  <SwitchRow
                    icon={<Heart className="size-4 text-rose-400" />}
                    label="เฉพาะรายการโปรด"
                    sub="ที่คุณกดหัวใจไว้"
                    checked={filters.favoritesOnly}
                    onChange={(v) => update("favoritesOnly", v)}
                    ariaLabel="เฉพาะรายการโปรด"
                  />
                )}
                {/* Blur toggle inside filter panel */}
                <SwitchRow
                  icon={<EyeOff className="size-4 text-amber-400" />}
                  label="เบลอรูปภาพ"
                  sub="ซ่อนรูปทั้งหมด (Safe Mode)"
                  checked={filters.blurImages}
                  onChange={(v) => update("blurImages", v)}
                  ariaLabel="เบลอรูปภาพ"
                />
              </section>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active tag pills row */}
      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.tags.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleTag(name)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold
                bg-white/10 text-white/80 border border-white/15 hover:bg-white/15 transition-colors"
            >
              {name}
              <X className="size-2.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            ล้าง
          </button>
        </div>
      )}

      {/* Blur active banner */}
      {filters.blurImages && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/30 border border-amber-800/30">
          <EyeOff className="size-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-400/80 flex-1">Safe Mode เปิดอยู่ — รูปภาพทั้งหมดถูกเบลอ</p>
          <button
            type="button"
            onClick={() => update("blurImages", false)}
            className="text-[10px] text-amber-500 hover:text-amber-300 font-semibold transition-colors shrink-0"
          >
            ปิด
          </button>
        </div>
      )}
    </div>
  )
}

function SwitchRow({
  icon, label, sub, checked, onChange, ariaLabel,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  checked: boolean
  onChange: (v: boolean) => void
  ariaLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-white/80">{label}</span>
          <span className="text-[11px] text-zinc-600">{sub}</span>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} />
    </div>
  )
}
