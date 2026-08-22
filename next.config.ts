import type { NextConfig } from "next";

// Catalogue thumbnails live in Supabase Storage (scripts/fetch-catalogue-images.ts),
// so next/image has to be told that host is allowed. Derived from the env var
// rather than hardcoded, so preview and production resolve to their own project.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // sharp's Linux native pieces (@img/sharp-linux-x64 + the libvips it
  // dlopens) must be traced into every serverless function that can load
  // it. Discovered 2026-08-22 on staging: the tracer dropped
  // libvips-cpp.so, so EVERY server action in any file importing sharp
  // died at module load — "Add a drawing" crashed without touching an
  // image, and the error screen's own logger died the same way, so
  // app_errors stayed empty. Only `vercel logs` showed the cause. The
  // globs match nothing on a Windows install (npm skips other-platform
  // optionals) and everything needed on Vercel's linux-x64 build.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // Design-view uploads. The browser already normalises each image to
      // ~300KB before sending, so this is headroom rather than the target
      // — but the 1MB default is below a single unresized render, which
      // fails as an opaque server error rather than a useful message.
      bodySizeLimit: "4mb",
    },
  },
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
