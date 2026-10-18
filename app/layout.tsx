import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PracticeBanner } from "@/components/ui/practice-banner";
import { THEME_COOKIE } from "@/lib/theme";
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
  title: "Toolbox by Kaadal",
  description: "Kaadal's internal tools",
};

// Paints the phone's address bar to match the page. Static <meta> tags resolve before our code,
// so they follow prefers-color-scheme, not the switch.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

/**
 * Applies a saved theme before paint. Blocking and inline on purpose: restoring from an effect flashes on every load.
 * Not read via cookies() in the layout: that opts the whole app out of static rendering (BUGCATCHER #6).
 */
const APPLY_SAVED_THEME = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The script changes <html> before hydration: the mismatch this suppresses.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_THEME }} />
        {/* In the root layout so sign-in and the kiosk show it too: know which site you are on before typing a password. */}
        <PracticeBanner />
        {children}
        {/* Page-load timings to Vercel; here so the kiosk routes are covered. No-op outside Vercel. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
