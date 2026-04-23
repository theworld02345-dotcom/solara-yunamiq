/**
 * lib/validate.ts
 *
 * Zod schemas สำหรับ validate input ก่อนส่งเข้า db.ts
 * ทุก admin action และ API endpoint ควร parse ผ่าน schema นี้ก่อนเสมอ
 */

import { z } from "zod"
import type { RoleName, NullReason } from "./types"

// ─── Primitives ───────────────────────────────────────────────────────────────

/** URL ที่ยอมรับเฉพาะ http / https เท่านั้น (ป้องกัน javascript:, data: URI) */
const HttpUrl = z
  .string()
  .trim()
  .min(1, "URL ต้องไม่ว่าง")
  .refine(
    (val) => {
      try {
        const { protocol } = new URL(val)
        return protocol === "http:" || protocol === "https:"
      } catch {
        return false
      }
    },
    { message: "URL ต้องเป็น http หรือ https เท่านั้น" }
  )

const ShortText = (label: string) =>
  z.string().trim().min(1, `${label} ต้องไม่ว่าง`).max(200, `${label} ยาวเกิน 200 ตัวอักษร`)

const LongText = (label: string) =>
  z.string().trim().min(0).max(2000, `${label} ยาวเกิน 2,000 ตัวอักษร`)

const RoleNameEnum = z.enum([
  "69Bath",
  "99Bath",
  "199Bath",
  "299Bath",
  "699Bath",
] as [RoleName, ...RoleName[]])

const HierarchyLevel = z.number().int().min(1).max(5)

// ─── Gallery ──────────────────────────────────────────────────────────────────

export const CreateGallerySchema = z.object({
  title: ShortText("title"),
  description: LongText("description"),
  /** thumbnail URL — ถ้าใช้ images แนะนำให้ส่งรูปแรกของ images มาที่นี่ด้วยเพื่อความเร็ว */
  thumbnail: z
    .string()
    .trim()
    .transform((v) => v || "/placeholder.jpg")
    .optional(),
  /** รายการรูปภาพทั้งหมด (URLs) */
  images: z.array(z.string().url().or(z.string().startsWith("/"))).optional(),
  tags: z.array(z.string().trim().min(1)).max(20, "tags สูงสุด 20 รายการ"),
  minLevel: HierarchyLevel,
  minRoleName: RoleNameEnum,
  isPinned: z.boolean(),
})

export type CreateGalleryInput = z.infer<typeof CreateGallerySchema>

export const UpdateGallerySchema = z
  .object({
    title: ShortText("title").optional(),
    description: LongText("description").optional(),
    description_html: z.string().max(50000, "description_html ยาวเกิน 50,000 ตัวอักษร").optional().nullable(),
    thumbnail: z.string().trim().optional(),
    images: z.array(z.string().trim()).optional(),
    tags: z.array(z.string().trim().min(1)).max(20).optional(),
    is_active: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
    minLevel: HierarchyLevel.optional(),
    minRoleName: RoleNameEnum.optional(),
  })
  .strict()

export type UpdateGalleryInput = z.infer<typeof UpdateGallerySchema>

// ─── Gallery Image ────────────────────────────────────────────────────────────

export const AddGalleryImageSchema = z.object({
  url: HttpUrl,
  caption: z
    .string()
    .trim()
    .max(300, "caption ยาวเกิน 300 ตัวอักษร")
    .optional(),
})

export type AddGalleryImageInput = z.infer<typeof AddGalleryImageSchema>

export const ReorderGalleryImagesSchema = z.object({
  orderedImageIds: z
    .array(z.string().uuid("imageId ต้องเป็น UUID"))
    .min(1, "ต้องมีอย่างน้อย 1 รูป"),
})

export type ReorderGalleryImagesInput = z.infer<typeof ReorderGalleryImagesSchema>

// ─── Link ─────────────────────────────────────────────────────────────────────

export const AddLinkSchema = z.object({
  label: ShortText("label"),
  url: HttpUrl,
  copyLimit: z
    .number()
    .int()
    .min(0, "copyLimit ต้องไม่ติดลบ")
    .max(9999, "copyLimit สูงสุด 9,999"),
  minLevel: HierarchyLevel,
  /**
   * bulk image URLs — array ของ URL (split บน client แล้ว)
   * ✅ v3.5: เปลี่ยนจาก z.string().transform() → z.array() โดยตรง
   *          เพราะ transform ทำให้ input type ≠ output type
   *          → parseOrThrow infer ผิด + TS error ใน actions.ts และ AdminCrudPanel.tsx
   */
  imageUrls: z
    .array(z.string().trim().min(1))
    .max(20, "imageUrls สูงสุด 20 รายการ")
    .optional()
    .default([]),
})

export type AddLinkInput = z.infer<typeof AddLinkSchema>

const NullReasonEnum = z.enum([
  "link_dead",
  "moved",
  "owner_request",
] as [Exclude<NullReason, null>, ...Exclude<NullReason, null>[]]).nullable()

export const UpdateLinkSchema = z
  .object({
    label: ShortText("label").optional(),
    url: HttpUrl.optional(),
    is_active: z.boolean().optional(),
    null_reason: NullReasonEnum.optional(),
    copy_limit_per_user: z
      .number()
      .int()
      .min(0)
      .max(9999)
      .optional(),
    accessible_by_min_level: HierarchyLevel.optional(),
  })
  .strict()

export type UpdateLinkInput = z.infer<typeof UpdateLinkSchema>

// ─── Tag ──────────────────────────────────────────────────────────────────────

/** ชื่อ tag: lowercase-kebab ไม่มีช่องว่าง ยาว 2-40 ตัวอักษร */
const TagName = z
  .string()
  .trim()
  .min(2, "tag name ต้องมีอย่างน้อย 2 ตัวอักษร")
  .max(40, "tag name ยาวเกิน 40 ตัวอักษร")
  .regex(/^[a-z0-9-]+$/, "tag name ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น")

export const CreateTagSchema = z.object({
  name: TagName,
  display: ShortText("display"),
  /** color เป็น CSS hex หรือ tailwind class string */
  color: z
    .string()
    .trim()
    .min(1, "color ต้องไม่ว่าง")
    .max(100, "color ยาวเกิน 100 ตัวอักษร"),
})

export type CreateTagInput = z.infer<typeof CreateTagSchema>

export const UpdateTagSchema = z
  .object({
    name: TagName.optional(),
    display: ShortText("display").optional(),
    color: z.string().trim().min(1).max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

export type UpdateTagInput = z.infer<typeof UpdateTagSchema>

// ─── Announcement Banner ──────────────────────────────────────────────────────

export const SetAnnouncementSchema = z.object({
  message: z
    .string()
    .trim()
    .max(500, "message ยาวเกิน 500 ตัวอักษร"),
  type: z.enum(["info", "warning", "success"]).nullable(),
})

export type SetAnnouncementInput = z.infer<typeof SetAnnouncementSchema>

// ─── Note ─────────────────────────────────────────────────────────────────────

export const SaveNoteSchema = z.object({
  contentHtml: z
    .string()
    .max(50_000, "note HTML ยาวเกิน 50,000 ตัวอักษร"),
  contentText: z
    .string()
    .max(20_000, "note plain-text ยาวเกิน 20,000 ตัวอักษร"),
})

export type SaveNoteInput = z.infer<typeof SaveNoteSchema>

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Parse และ throw Error ที่อ่านง่าย ถ้า validation ล้มเหลว
 * ใช้แทน schema.parse() เพื่อให้ error message สื่อความหมายขึ้น
 *
 * @example
 * const data = parseOrThrow(CreateGallerySchema, rawInput, "CreateGallery")
 */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  label = "input"
): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join(".") || label}: ${e.message}`)
      .join("; ")
    throw new Error(`Validation failed — ${messages}`)
  }
  return result.data
}
