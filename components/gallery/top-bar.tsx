"use client"

import { Archive, LogIn, Settings, ChevronDown, FileText } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SessionUser } from "@/lib/types"
import { loginAction } from "@/app/actions"
import { useTransition } from "react"
import Link from "next/link"

export type NavView = "gallery" | "note"

interface TopBarProps {
  session: SessionUser | null
  onOpenProfile: () => void
  activeNav?: NavView
  onNavChange?: (nav: NavView) => void
}

const ROLE_COLOURS: Record<string, { bg: string; text: string; dot: string }> = {
  "699Bath": { bg: "bg-rose-500/15",   text: "text-rose-300",   dot: "bg-rose-400"   },
  "299Bath": { bg: "bg-amber-500/15",  text: "text-amber-300",  dot: "bg-amber-400"  },
  "199Bath": { bg: "bg-blue-500/15",   text: "text-blue-300",   dot: "bg-blue-400"   },
  "99Bath":  { bg: "bg-violet-500/15", text: "text-violet-300", dot: "bg-violet-400" },
  "69Bath":  { bg: "bg-zinc-700/50",   text: "text-zinc-300",   dot: "bg-zinc-400"   },
}

export function TopBar({ session, onOpenProfile, activeNav = "gallery", onNavChange }: TopBarProps) {
  const [pending, start] = useTransition()

  const topRole = session?.active_roles?.length
    ? session.active_roles[session.active_roles.length - 1]
    : null
  const roleCfg = topRole ? (ROLE_COLOURS[topRole] ?? ROLE_COLOURS["69Bath"]) : null

  return (
    <header className="sticky top-0 z-30 bg-zinc-900 border-b border-white/8 backdrop-blur-md">
      <div className="flex items-center h-14 px-4 gap-3">

        {/* Brand */}
        <div className="flex items-center gap-2 select-none shrink-0">
          <span className="text-sm font-black tracking-[0.25em] text-white/90 uppercase">
            SOLARA
          </span>
          <span className="w-px h-4 bg-white/15" />
        </div>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0.5 h-full">
          <NavTab
            active={activeNav === "gallery"}
            onClick={() => onNavChange?.("gallery")}
            icon={<Archive className="size-4" />}
            label="Gallery"
          />
          <NavTab
            active={activeNav === "note"}
            onClick={() => onNavChange?.("note")}
            icon={<FileText className="size-4" />}
            label="Note"
          />
          {session?.is_owner && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-200
                hover:bg-white/5 transition-all text-sm"
            >
              <Settings className="size-4" />
              <span className="font-medium">Admin</span>
            </Link>
          )}
        </nav>

        <div className="flex-1" />

        {/* Right — user / login */}
        {session ? (
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label={`Open profile for ${session.discord_tag}`}
            className={cn(
              "group flex items-center gap-0 rounded-2xl overflow-hidden",
              "bg-white/5 hover:bg-white/8 border border-white/8 hover:border-white/15",
              "transition-all duration-200 active:scale-[0.98]",
            )}
          >
            <div className="relative pl-1.5 py-1">
              <Avatar className="size-8 ring-1 ring-white/15 group-hover:ring-white/25 transition-all">
                <AvatarImage src={session.avatar ?? undefined} alt={session.discord_tag} />
                <AvatarFallback className="bg-zinc-700 text-white text-xs font-bold">
                  {session.discord_tag.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-1 right-0 size-2 rounded-full bg-emerald-400 ring-2 ring-zinc-900" />
            </div>

            <div className="flex flex-col items-start px-2.5 py-1.5 min-w-0">
              <span className="text-xs font-bold text-white/90 leading-tight truncate max-w-[120px]">
                {session.discord_tag}
              </span>
              {roleCfg && topRole ? (
                <span className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5",
                  roleCfg.bg, roleCfg.text,
                )}>
                  <span className={cn("size-1.5 rounded-full shrink-0", roleCfg.dot)} />
                  {topRole}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-600 mt-0.5">ไม่มี Role</span>
              )}
            </div>

            <div className="pr-2.5 pl-0.5">
              <ChevronDown className="size-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </div>
          </button>
        ) : (
          <Button
            type="button"
            onClick={() => start(() => loginAction())}
            disabled={pending}
            size="sm"
            className="rounded-full bg-white text-zinc-900 hover:bg-white/90 font-bold text-xs px-4"
          >
            <LogIn className="size-3.5" />
            {pending ? "กำลังเข้าสู่ระบบ..." : "LOG IN"}
          </Button>
        )}
      </div>
    </header>
  )
}

/* ── NavTab helper ── */
function NavTab({
  active, onClick, icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-white/10 text-white"
          : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}