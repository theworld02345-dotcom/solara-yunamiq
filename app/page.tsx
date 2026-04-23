import { GalleryView } from "@/components/gallery/gallery-view"
import { getSession } from "@/lib/auth"
import { getDiscordConfig, getUserById, listGalleries, listTags, getAnnouncementNote } from "@/lib/db"

export default async function GalleryPage() {
  const discord = getDiscordConfig()
  const [session, galleries, tags, note] = await Promise.all([
    getSession(),
    listGalleries(),
    listTags(),
    getAnnouncementNote(),
  ])

  // Resolve uploader names for the detail modal table.
  const owner = await getUserById(discord.ownerid_user)
  const uploaderName = owner?.username ?? "owner"

  return (
    <GalleryView
      session={session}
      galleries={galleries}
      tags={tags}
      discord={discord}
      uploaderName={uploaderName}
      note={note}
    />
  )
}
