import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"

export const metadata = { title: "Admin Panel — Solara" }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  // Hard block: only owner can access /admin
  if (!session || !session.is_owner) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {children}
    </div>
  )
}