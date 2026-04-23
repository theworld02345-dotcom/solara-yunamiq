"use server"

/**
 * app/admin/digital-override-actions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server Actions สำหรับ Digital-RoleID Override system
 * วางไฟล์ที่:  app/admin/digital-override-actions.ts  (ไฟล์ใหม่)
 *
 * ใช้งาน:
 *   import {
 *     actionCreateDigitalOverride,
 *     actionRevokeDigitalOverride,
 *     actionGetAllDigitalOverrides,
 *   } from "@/app/admin/digital-override-actions"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth"
import {
  createDigitalOverride,
  revokeDigitalOverride,
  getAllDigitalOverrides,
} from "@/lib/db"
import type { DigitalRoleOverride, RoleName } from "@/lib/types"

// ─── Response wrapper ───────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ─── Auth guard ─────────────────────────────────────────────────────────────

async function requireOwner(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "ไม่ได้เข้าสู่ระบบ" }
  if (!session.is_owner) return { ok: false, error: "ไม่มีสิทธิ์ admin" }
  return { ok: true, userId: session.user_id }
}

// ─── DIGITAL OVERRIDE ACTIONS ───────────────────────────────────────────────

/**
 * สร้าง Digital-RoleID Override ใหม่
 *
 * @param userId    Discord ID ของ user ที่จะได้รับ override
 * @param roleName  ยศที่จะให้ชั่วคราว
 * @param expiresAt เวลาหมดอายุ ISO string เช่น "2026-04-25T12:00:00.000Z"
 * @param note      หมายเหตุ (optional)
 * @param confirmedByRoleId Discord Role ID สำหรับตรวจ auto-supersede (optional)
 *                  - null = ใช้ role ID จาก env อัตโนมัติ
 *                  - "1232813070141624330" = ระบุเองตรงๆ
 */
export async function actionCreateDigitalOverride(input: {
  userId: string
  roleName: RoleName
  expiresAt: string
  note?: string
  confirmedByRoleId?: string | null
}): Promise<ActionResult<DigitalRoleOverride>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  // Validate input
  if (!input.userId || !/^\d{17,20}$/.test(input.userId.trim())) {
    return { ok: false, error: "userId ต้องเป็น Discord snowflake (ตัวเลข 17-20 หลัก)" }
  }

  const expiresDate = new Date(input.expiresAt)
  if (isNaN(expiresDate.getTime())) {
    return { ok: false, error: "expiresAt ไม่ใช่วันเวลาที่ถูกต้อง" }
  }
  if (expiresDate <= new Date()) {
    return { ok: false, error: "expiresAt ต้องเป็นวันเวลาในอนาคต" }
  }

  const validRoles: RoleName[] = ["69Bath", "99Bath", "199Bath", "299Bath", "699Bath"]
  if (!validRoles.includes(input.roleName)) {
    return { ok: false, error: `roleName ต้องเป็นหนึ่งใน: ${validRoles.join(", ")}` }
  }

  const override = await createDigitalOverride({
    userId: input.userId.trim(),
    roleName: input.roleName,
    expiresAt: expiresDate.toISOString(),
    adminId: auth.userId,
    note: input.note,
    confirmedByRoleId: input.confirmedByRoleId,
  })

  if (!override) {
    return { ok: false, error: "สร้าง override ไม่สำเร็จ — ตรวจสอบ roleName และ Discord Role ID ใน env" }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/users")
  return { ok: true, data: override }
}

/**
 * Revoke (ยกเลิก) Digital Override ก่อนหมดเวลา
 */
export async function actionRevokeDigitalOverride(
  overrideId: string
): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  if (!overrideId) {
    return { ok: false, error: "overrideId ต้องไม่ว่าง" }
  }

  const ok = await revokeDigitalOverride(overrideId, auth.userId)
  if (!ok) return { ok: false, error: "Revoke ไม่สำเร็จ — อาจถูก revoke ไปแล้ว" }

  revalidatePath("/admin")
  revalidatePath("/admin/users")
  return { ok: true, data: undefined }
}

/**
 * ดึงรายการ overrides ทั้งหมด (admin view)
 * ใช้แสดงใน Admin dashboard
 */
export async function actionGetAllDigitalOverrides(opts?: {
  userId?: string
  includeExpired?: boolean
  limit?: number
}): Promise<ActionResult<DigitalRoleOverride[]>> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const overrides = await getAllDigitalOverrides({
    userId: opts?.userId,
    includeExpired: opts?.includeExpired ?? false,
    limit: opts?.limit ?? 100,
  })

  return { ok: true, data: overrides }
}
