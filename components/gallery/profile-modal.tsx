"use client"

import { useTransition } from "react"
import { Copy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { DiscordConfig, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"
import { logoutAction } from "@/app/actions"

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: SessionUser
  discord: DiscordConfig
}

export function ProfileModal({ open, onOpenChange, session, discord }: ProfileModalProps) {
  const [pending, start] = useTransition()

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`คัดลอก ${label} แล้ว`)
    } catch {
      toast.error("คัดลอกไม่สำเร็จ")
    }
  }

  const activeSet = new Set(session.active_roles)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Profile — {session.discord_tag}</DialogTitle>
        <DialogDescription className="sr-only">
          Discord profile, roles, and account actions.
        </DialogDescription>

        <div className="p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <Avatar className="size-16 border-2 border-border">
              {/* P1 fix: render actual Discord avatar when available */}
              {session.avatar && (
                <AvatarImage
                  src={session.avatar}
                  alt={session.discord_tag}
                />
              )}
              <AvatarFallback className="bg-destructive/10 text-destructive text-xl font-bold">
                {session.discord_tag.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div className="flex flex-col">
                  <h2 className="text-3xl font-extrabold text-primary leading-none">{session.discord_tag}</h2>
                  <button
                    type="button"
                    onClick={() => copyText(session.user_id, "User ID")}
                    className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    {session.user_id}
                    <Copy className="size-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1 ml-auto sm:ml-0">
                  <span className="text-primary font-semibold">username:</span>
                  <button
                    type="button"
                    onClick={() => copyText(session.username, "username")}
                    className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {session.username}
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={() => start(async () => {
                await logoutAction()
                onOpenChange(false)
              })}
              disabled={pending}
              className="rounded-full bg-destructive/90 hover:bg-destructive"
            >
              {pending ? "กำลังออก..." : "Log out"}
            </Button>
          </div>

          {/* Roles */}
          <section>
            <div className="flex flex-wrap items-baseline gap-3 mb-2">
              <h3 className="text-xl font-bold">Role:</h3>
              <p className="text-xs text-muted-foreground">
                <span className="text-primary font-semibold">*Blue = Role Discord active!</span>
                <span className="mx-2">·</span>
                <span className="text-destructive font-semibold">*Red = Role Discord denied!</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {discord.role_id.map((role) => {
                const isActive = activeSet.has(role.name)
                return (
                  <div
                    key={role.id}
                    className={cn(
                      "flex flex-col items-center justify-center px-4 py-2 rounded-full min-w-[110px]",
                      "border text-center leading-tight",
                      isActive
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-destructive/10 border-destructive/30 text-destructive",
                    )}
                  >
                    <span className="font-bold text-sm">{role.name}</span>
                    <span className="font-mono text-[10px] opacity-70">{role.id}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Note */}
          <section className="rounded-xl bg-primary/5 border border-primary/15 p-4 text-sm leading-relaxed space-y-3">
            <h3 className="text-xl font-bold text-foreground">Note:</h3>
            <div>
              <p className="font-semibold">การอ้างอิงข้อมูล:</p>
              <p className="text-muted-foreground">
                - Role จะ sync อัตโนมัติทุก 15 นาที หาก Role มีการเปลี่ยนแปลงในเซิร์ฟเวอร์ Discord
                สามารถ Log out แล้ว Log in ใหม่เพื่อรับข้อมูลล่าสุดทันที
              </p>
            </div>
            <div>
              <p className="font-semibold">การพัฒนาต่อเนื่อง:</p>
              <p className="text-muted-foreground">
                - การเปิดรับข้อเสนอแนะจากผู้ใช้จะช่วยให้คุณเห็นจุดที่ต้องปรับปรุงในโปรเจกต์ เช่น
                การจัดการสิทธิ์ใน Select Menu ที่คุณกำลังทำอยู่
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
