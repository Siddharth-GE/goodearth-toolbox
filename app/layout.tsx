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
  title: "Goodearth Toolbox",
  description: "Internal tools platform for Goodearth",
};

// Paints the phone browser's own address bar to match the page, so a dark
// screen isn't topped by a white strip. Values quoted from app/globals.css.
// These stay on prefers-color-scheme rather than following the switch:
// they are static <meta> tags the browser resolves before any of our code
// runs. Worst case is one strip of chrome not matching.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

/**
 * Applies a saved theme before the page paints.
 *
 * Blocking and inline on purpose. The parser stops here, sets the
 * attribute app/globals.css keys off, and only then reads the rest of the
 * body — so a person who chose dark never sees a white frame first. The
 * usual alternative, restoring the theme from an effect after hydration,
 * flashes on every single load.
 *
 * Reading the cookie in the layout instead would be tidier, but calling
 * cookies() here opts the whole app out of static rendering — measured:
 * it turned /login, /_not-found and /_global-error from prerendered into
 * server-rendered-on-demand, and cold starts are already this app's known
 * performance problem (AUDIT.md PERF-01). Nine lines of script is the
 * cheaper trade.
 *
 * No cookie leaves the attribute off entirely, which is what makes
 * globals.css fall through to the device's own setting.
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
      // The script above changes <html> before React hydrates, which is
      // exactly the mismatch this suppresses.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_THEME }} />
        {/* In the root layout so it covers the sign-in pages and the
            marathon kiosk too, not just the dashboard — you should know
            which site you are on before you type a password into it.
            Renders nothing on production. */}
        <PracticeBanner />
        {children}
        {/* Real-user page-load timings, reported to Vercel. Sits in the root
            layout so it covers the kiosk routes (app/marathon) too, not just
            the dashboard shell. No-op outside a Vercel deployment. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
