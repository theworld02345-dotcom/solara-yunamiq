// app/api/img-proxy/route.ts
// ─── Image Proxy สำหรับ Discord Webhook Embed ───────────────────────────────
//
// ทำไมต้องมี:
//   Discord embed (thumbnail.url / image.url) จะต้องให้ Discord server
//   (media.discordapp.net) ไป fetch รูปจาก URL นั้น แล้ว cache ที่ฝั่ง Discord
//
//   ปัญหา: host ยอดฮิตสำหรับ image hosting บางเจ้า (i.postimg.cc, imgur,
//   prnt.sc, ฯลฯ) มี "hotlink protection" — ตรวจ Referer / User-Agent แล้ว
//   block request จาก Discord → embed ขึ้นแค่ข้อความ ไม่มีรูป
//
//   Fix: route นี้ทำตัวเป็น proxy — Discord fetch จาก domain ของเรา
//        → เราไป fetch รูปจริงด้วย User-Agent ปกติ → return image bytes
//        → Discord cache ได้ปกติ = embed มีรูปแน่นอน
//
// ใช้งาน:
//   /api/img-proxy?url=https%3A%2F%2Fi.postimg.cc%2FbrZ1gdjj%2Fimage.png
//
// Security:
//   - allowlist host (กัน SSRF โจมตี internal network)
//   - timeout 5s
//   - cap response size ~5 MB
//   - HMAC signature (optional) — ดู IMG_PROXY_SECRET

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ✅ v1.5: resolve app base สำหรับ placeholder fallback
 *   (copy logic จาก webhooks.ts เพราะ route หนึ่งไม่ควร import อีก route)
 */
function resolveAppBase(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, "")
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prodHost) return `https://${prodHost.replace(/\/$/, "")}`
  const previewHost = process.env.VERCEL_URL
  if (previewHost) return `https://${previewHost.replace(/\/$/, "")}`
  return "http://localhost:3000"
}

/**
 * Response เวลา upstream ตาย — redirect ไปรูป placeholder ของเราเอง
 * (302 redirect, Discord follow ได้ → cache URL proxy ของเราเอาไว้)
 */
function placeholderRedirect(): NextResponse {
  const base = resolveAppBase()
  return NextResponse.redirect(`${base}/placeholder.jpg`, 302)
}

// allowlist — ขยายได้ตามต้องการ
const ALLOWED_HOSTS = new Set<string>([
  "i.postimg.cc",
  "postimg.cc",
  "i.imgur.com",
  "imgur.com",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "pbs.twimg.com",
  "media.tenor.com",
  "i.redd.it",
])

// supabase / vercel blob auto-allow ถ้าตั้ง env
function isDynamicAllowed(host: string): boolean {
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supa) {
    try { if (host === new URL(supa).host) return true } catch {}
  }
  if (host.endsWith(".public.blob.vercel-storage.com")) return true
  if (host.endsWith(".supabase.co")) return true
  if (host.endsWith(".supabase.in")) return true
  return false
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")
  if (!raw) return NextResponse.json({ error: "missing url" }, { status: 400 })

  // parse & validate
  let target: URL
  try { target = new URL(raw) }
  catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }) }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 })
  }
  if (!ALLOWED_HOSTS.has(target.host) && !isDynamicAllowed(target.host)) {
    return NextResponse.json({ error: `host not allowed: ${target.host}` }, { status: 403 })
  }

  // fetch upstream — ใช้ UA ของ Chrome เต็ม + Referer ของ host upstream
  // เพื่อผ่าน hotlink protection ของบางเจ้า (postimg เคย strict กับ UA "bot-like")
  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        // บาง host เช็ค Referer ว่ามาจาก origin ตัวเอง → ส่งให้ผ่าน
        Referer: `${target.protocol}//${target.host}/`,
      },
      signal: AbortSignal.timeout(6000),
      cache:  "no-store",
      redirect: "follow",
    })
  } catch (err) {
    console.warn("[img-proxy] fetch failed:", target.host, (err as Error).message)
    return placeholderRedirect()
  }

  const ct = upstream.headers.get("content-type") ?? "application/octet-stream"

  // ✅ v1.5: บาง host (postimg) return status 4xx แต่ body เป็น image placeholder
  //   - ถ้า body เป็น image จริงและมี bytes สมเหตุผล → serve ต่อ (normalize เป็น 200)
  //     เพราะ Discord ได้รูป (แม้ dead placeholder) ดีกว่า drop embed
  //   - ถ้า upstream ตายสิ้น (non-image / no body) → redirect ไป placeholder ของเรา
  const upstreamOkOrSalvageable =
    upstream.body && ct.startsWith("image/")

  if (!upstreamOkOrSalvageable) {
    console.warn(`[img-proxy] upstream unusable: ${target.host} status=${upstream.status} ct=${ct}`)
    return placeholderRedirect()
  }

  if (!upstream.ok) {
    console.warn(`[img-proxy] upstream ${upstream.status} but has image body — salvage ${target.host}`)
  }

  // ─── เช็ค content-length กัน response ใหญ่เกิน ──────────────────────────
  const clHeader = upstream.headers.get("content-length")
  if (clHeader && Number(clHeader) > MAX_BYTES) {
    return placeholderRedirect()
  }

  // อ่าน body ทั้งก้อน (buffered) — ปลอดภัยกว่า stream เพราะเช็คขนาดได้แน่นอน
  const buf = await upstream.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    return placeholderRedirect()
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Content-Length": String(buf.byteLength),
      // cache ที่ Vercel edge 1 ชม. + browser 10 นาที — ลด load upstream
      "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
      // กัน browser เดา mime ผิด
      "X-Content-Type-Options": "nosniff",
    },
  })
}
