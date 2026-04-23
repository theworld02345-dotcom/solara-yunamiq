/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // ✅ FIX: GIF support — ปิด optimization เฉพาะ format gif
    // next/image จะ convert GIF → WebP ทำให้ animation หายไปทันที
    // วิธีแก้ที่ถูกต้องคือเพิ่ม formats array และ handle ใน component ด้วย unoptimized prop
    formats: ["image/avif", "image/webp"],

    // ✅ เพิ่ม hostname ที่ใช้งานจริงในระบบ
    remotePatterns: [
      // Discord avatars
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/avatars/**",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/embed/avatars/**",
      },
      // Discord media (GIF attachments, stickers)
      {
        protocol: "https",
        hostname: "media.discordapp.net",
        pathname: "/**",
      },
      // Postimg
      {
        protocol: "https",
        hostname: "i.postimg.cc",
        pathname: "/**",
      },
      // Imgur (รูปทั่วไป + GIF)
      {
        protocol: "https",
        hostname: "i.imgur.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "imgur.com",
        pathname: "/**",
      },
      // ✅ NEW: Tenor (GIF embed จาก Discord มักมาจาก tenor)
      {
        protocol: "https",
        hostname: "media.tenor.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "c.tenor.com",
        pathname: "/**",
      },
      // ✅ NEW: Giphy
      {
        protocol: "https",
        hostname: "media.giphy.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media0.giphy.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media1.giphy.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media2.giphy.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media3.giphy.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media4.giphy.com",
        pathname: "/**",
      },
      // ✅ NEW: Catbox (นิยมใช้ใน community ไทย)
      {
        protocol: "https",
        hostname: "files.catbox.moe",
        pathname: "/**",
      },
      // ✅ NEW: Litterbox
      {
        protocol: "https",
        hostname: "litter.catbox.moe",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig
