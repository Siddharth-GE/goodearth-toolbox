import type { MetadataRoute } from "next";

// What the Android app (a Trusted Web Activity, android/PLAN.md) and "Add to home screen" read.
// Public in lib/supabase/proxy.ts, with its icons: Chrome and Play fetch them without a session.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kaadal Toolbox",
    short_name: "Toolbox",
    description: "Kaadal's internal tools",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#521323",
    background_color: "#f4f2ee",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
