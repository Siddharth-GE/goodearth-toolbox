import type { NextConfig } from "next";

// Catalogue thumbnails live in Supabase Storage (scripts/fetch-catalogue-images.ts),
// so next/image has to be told that host is allowed. Derived from the env var
// rather than hardcoded, so preview and production resolve to their own project.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
