// app/api/webhook-diag/route.ts
// ─── Webhook Diagnostic ─────────────────────────────────────────────────────
//
// ใช้ debug ปัญหา thumbnail ไม่ขึ้น — user เปิด browser เข้า URL นี้ได้ทันที
// จะ return JSON บอกว่า:
//   - APP_URL ที่ระบบ resolve ได้คืออะไร
//   - env webhook ตั้งครบมั้ย
//   - URL proxy ที่จะส่งให้ Discord สำหรับรูปตัวอย่าง
//   - ทดสอบ fetch upstream ว่าเข้าถึงได้จริงมั้ย (optional ?test=1)
//
// Security: ต้องส่ง ?key=<DIAG_KEY> จาก env ถึงจะเข้าได้ (กัน public leak config)
//           ถ้าไม่ตั้ง DIAG_KEY → block ทันที

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resolveAppBase(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, "")
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prodHost) return `https://${prodHost.replace(/\/$/, "")}`
  const previewHost = process.env.VERCEL_URL
  if (previewHost) return `https://${previewHost.replace(/\/$/, "")}`
  return "http://localhost:3000"
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key")
  const expected = process.env.DIAG_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "DIAG_KEY env not configured — add to Vercel env first" },
      { status: 503 }
    )
  }
  if (key !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const base     = resolveAppBase()
  const isLocal  = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base)
  // ✅ v1.5: default test URL ใช้ placeholder ของเราเอง (same-origin, alive แน่)
  //    ถ้าต้องการเช็ค upstream จริง ส่ง ?imageUrl=<encoded>
  const testUrl  = req.nextUrl.searchParams.get("imageUrl")
                 ?? `${base}/placeholder.jpg`

  // URL ที่ webhooks.ts จะ render จริง
  const proxyUrl = isLocal
    ? testUrl
    : `${base}/api/img-proxy?url=${encodeURIComponent(testUrl)}`

  const result: Record<string, unknown> = {
    resolvedBase: base,
    isLocal,
    env: {
      NEXT_PUBLIC_APP_URL:          process.env.NEXT_PUBLIC_APP_URL         ?? null,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      VERCEL_URL:                   process.env.VERCEL_URL                  ?? null,
      VERCEL_ENV:                   process.env.VERCEL_ENV                  ?? null,
      ADMIN_WEBHOOK_set:            !!process.env.ADMIN_WEBHOOK,
      PRODUCT_WEBHOOK_set:          !!process.env.PRODUCT_WEBHOOK,
      WEBHOOK_DEBUG:                process.env.WEBHOOK_DEBUG               ?? null,
    },
    testImageUrl:       testUrl,
    discordWillFetch:   proxyUrl,
  }

  // ถ้ามี ?test=1 → fetch proxy URL ภายใน (ดูว่า Discord fetch แล้วจะได้อะไร)
  if (req.nextUrl.searchParams.get("test") === "1") {
    try {
      const r = await fetch(proxyUrl, {
        method: "GET",
        signal: AbortSignal.timeout(6000),
        cache:  "no-store",
        redirect: "follow",   // v1.5: proxy อาจ 302 → placeholder
      })
      const ct = r.headers.get("content-type") ?? null
      const cl = r.headers.get("content-length")
      result.proxyTest = {
        ok:             r.ok,
        status:         r.status,
        contentType:    ct,
        contentLength:  cl ? Number(cl) : null,
        finalUrl:       r.url,     // v1.5: หลัง redirect
        wouldDiscordRender: r.ok && (ct?.startsWith("image/") ?? false),
      }
    } catch (err) {
      result.proxyTest = { ok: false, error: (err as Error).message }
    }
  }

  // ✅ v1.5: ?probe=1 → ยิง HEAD upstream ตรง ไม่ผ่าน proxy
  //   ช่วยแยกว่า "URL ตาย" (upstream fault) vs "proxy พัง" (our fault)
  if (req.nextUrl.searchParams.get("probe") === "1") {
    try {
      const r = await fetch(testUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(6000),
        cache:  "no-store",
        redirect: "follow",
      })
      const ct = r.headers.get("content-type") ?? null
      const cl = r.headers.get("content-length")
      result.upstreamProbe = {
        status:        r.status,
        ok:            r.ok,
        contentType:   ct,
        contentLength: cl ? Number(cl) : null,
        alive:         r.ok && (ct?.startsWith("image/") ?? false),
      }
    } catch (err) {
      result.upstreamProbe = { alive: false, error: (err as Error).message }
    }
  }

  return NextResponse.json(result, {
    status:  200,
    headers: { "Cache-Control": "no-store" },
  })
}
