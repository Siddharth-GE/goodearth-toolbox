import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PracticeBanner } from "@/components/ui/practice-banner";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Outfit stands in for the brand's Gilroy until a web licence exists; Gambetta is the brand's heading face.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "latin-ext"],
});

const gambetta = localFont({
  variable: "--font-gambetta",
  src: [
    { path: "./fonts/Gambetta-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Gambetta-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Gambetta-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Gambetta-500-italic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/Gambetta-600.woff2", weight: "600", style: "normal" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Toolbox by Kaadal",
  description: "Kaadal's internal tools",
};

// Paints the phone's address bar to match the brand top bar (burgundy, deep teal in dark).
// Static <meta> tags resolve before our code, so they follow prefers-color-scheme, not the switch.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#521323" },
    { media: "(prefers-color-scheme: dark)", color: "#102228" },
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
      className={`${outfit.variable} ${gambetta.variable} ${geistMono.variable} h-full antialiased`}
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
