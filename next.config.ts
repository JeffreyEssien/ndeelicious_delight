import type { NextConfig } from "next";

function productImagePatterns() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return [];
  try {
    return [new URL("/storage/v1/object/public/product-images/**", supabaseUrl)];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  distDir: process.env.NDEE_BROWSER_FIXTURES === "true" ? ".next-fixtures" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(self)" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/documents/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: productImagePatterns(),
    deviceSizes: [320, 420, 640, 750, 828, 1080, 1200, 1440, 1920, 2560, 3840],
    qualities: [60, 75],
  },
};

export default nextConfig;
