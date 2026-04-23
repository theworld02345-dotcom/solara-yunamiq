import { getSession } from "@/lib/auth"
import {
  listGalleries,
  listTags,
  getAllUsers,
  getAllGalleriesRaw,
  getAnnouncementBanner,
  getAnnouncementNote,
} from "@/lib/db"
import { AdminShell } from "@/components/admin/admin-shell"
import { redirect } from "next/navigation"

export default async function AdminPage() {
  const session = await getSession()
  if (!session?.is_owner) redirect("/")

  const [users, galleries, tags, announcement, note] = await Promise.all([
    getAllUsers(),
    getAllGalleriesRaw(),
    listTags(),
    getAnnouncementBanner(),
    getAnnouncementNote(),
  ])

  const stats = {
    totalUsers: users.length,
    bannedUsers: users.filter((u) => u.is_banned).length,
    totalGalleries: galleries.length,
    activeGalleries: galleries.filter((g) => g.is_active).length,
    totalLinks: galleries.reduce((acc, g) => acc + g.links.length, 0),
    totalViews: galleries.reduce((acc, g) => acc + g.stats.total_views, 0),
    totalCopies: galleries.reduce((acc, g) => acc + g.stats.total_copies, 0),
    totalTags: tags.length,
    activeTags: tags.filter((t) => t.is_active).length,
  }

  return (
    <AdminShell
      session={session}
      users={users}
      galleries={galleries}
      tags={tags}
      stats={stats}
      announcement={announcement}
      note={note}
    />
  )
}
