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
  images: {
    remotePatterns: productImagePatterns(),
  },
};

export default nextConfig;
