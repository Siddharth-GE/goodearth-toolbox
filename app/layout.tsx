import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goodearth Toolbox",
  description: "Internal tools platform for Goodearth",
};

// Paints the phone browser's own address bar to match the page, so a
// dark screen isn't topped by a white strip. Both values are quoted from
// app/globals.css. These stay on prefers-color-scheme even when the
// switch overrides the page: Next renders them as static <meta> tags with
// media attributes, and the browser resolves them before it has our
// cookie. Getting it wrong tints one strip of chrome; there is no way to
// get it right without shipping the wrong colour first.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read on the server so the very first frame is already the right
  // colour. Restoring the theme from JavaScript after hydration is the
  // usual way to do this and it flashes white on every load.
  //
  // Absent or unrecognised leaves the attribute off entirely, which is
  // what makes globals.css fall through to the device's own setting.
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        {/* Real-user page-load timings, reported to Vercel. Sits in the root
            layout so it covers the kiosk routes (app/marathon) too, not just
            the dashboard shell. No-op outside a Vercel deployment. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
