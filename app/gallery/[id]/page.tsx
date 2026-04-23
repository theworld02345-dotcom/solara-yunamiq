import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

/**
 * /gallery/[id] → redirect ไป /?g=[id]
 *
 * เหตุผล: ระบบใช้ SPA modal pattern ผ่าน query param ?g=
 * แต่ share URL เคยสร้างเป็น /gallery/[id] ทำให้ 404
 * Route นี้ทำหน้าที่ bridge: ใครที่คลิก share link เก่า
 * หรือ link จาก discord/social จะถูก redirect มาเปิด modal ถูกต้อง
 */
export default async function GalleryRedirectPage({ params }: Props) {
  const { id } = await params
  redirect(`/?g=${id}`)
}
