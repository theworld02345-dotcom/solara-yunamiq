// app/api/check-role/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CheckRoleQuerySchema = z.object({
  /** Discord user ID — 17-20 digit snowflake */
  userId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, "userId ต้องเป็น Discord snowflake (ตัวเลข 17-20 หลัก)"),
});

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const parsed = CheckRoleQuerySchema.safeParse({
      userId: searchParams.get("userId"),
    });

    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { userId } = parsed.data;

    const botApiUrl = process.env.BOT_API_URL;
    const apiKey = process.env.BOT_API_SECRET_KEY;

    if (!botApiUrl || !apiKey) {
        return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า env" }, { status: 500 });
    }

    try {
        const res = await fetch(`${botApiUrl}/check-role?userId=${encodeURIComponent(userId)}`, {
            headers: {
                "x-api-key": apiKey,
            },
            // ไม่ cache เพื่อให้ได้ข้อมูลล่าสุดเสมอ
            cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        return NextResponse.json(data);
    } catch {
        return NextResponse.json(
            { error: "ไม่สามารถเชื่อมต่อกับ Bot API ได้" },
            { status: 503 }
        );
    }
}