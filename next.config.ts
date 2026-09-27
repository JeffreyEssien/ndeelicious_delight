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
  async headers() {
    return [
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
  },
};

export default nextConfig;
