import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { LanguageProvider } from "./game/i18n/LanguageContext";
import { SoundSettingsProvider } from "./game/settings/SoundSettingsContext";
import "./globals.css";

// Special Elite (Apache 2.0), self-hosted: builds kept failing on flaky
// fetches to fonts.gstatic.com, and bundling kills that dependency for
// Vercel too.
const specialElite = localFont({
  src: "./fonts/SpecialElite.woff2",
  variable: "--font-elite",
  weight: "400",
  display: "swap",
  // Turbopack dev fails decompressing this woff2 when computing the
  // size-adjusted fallback ("get_font_fallbacks ... compression error").
  // Skip it and declare fallbacks by hand — it's a decorative font.
  adjustFontFallback: false,
  fallback: ["Courier New", "monospace"],
});

// SpecialElite has no Sinhala glyphs. Self-hosted (same reasoning as
// above) so Sinhala UI text still renders under the horror typewriter
// aesthetic instead of falling back to a system sans-serif.
const notoSinhala = localFont({
  src: "./fonts/NotoSansSinhala.woff2",
  variable: "--font-sinhala",
  weight: "400 700",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Noto Sans Sinhala", "sans-serif"],
});

const SITE = "https://backroom-escape.vercel.app";

export const metadata: Metadata = {
  // Absolute base so og:image/twitter:image resolve for social scrapers.
  metadataBase: new URL(SITE),
  title: "The Dark Intersection",
  description:
    "Play the Backrooms free in your browser. First-person horror in a procedurally generated maze — find the 8 pages, escape Level 0, don't let it hear you walk. No download.",
  applicationName: "Backrooms: Level 0",
  authors: [{ name: "Hashanwickramasooriya", url: "https://github.com/Hashanwickramasooriya" }],
  creator: "Hashanwickramasooriya",
  keywords: [
    "backrooms game",
    "backrooms",
    "play backrooms online",
    "browser horror game",
    "free horror game",
    "level 0",
    "liminal space game",
    "no download horror game",
    "three.js game",
    "procedural horror",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Backrooms: Level 0 — Free Browser Horror Game",
    description:
      "You noclipped out of reality. Find the 8 pages, escape the maze, don't let it hear you walk. Every run is a maze that has never existed before.",
    url: "/",
    siteName: "Backrooms: Level 0",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "Hashan Wickramasooriya",
    creator: "Hashan Wickramasooriya",
    title: "Backrooms: Level 0 — Free Browser Horror Game",
    description:
      "You noclipped out of reality. Find the 8 pages, escape the maze, don't let it hear you walk.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0905",
  colorScheme: "dark",
  // Game viewport: bleed under notches in fullscreen, no pinch/double-tap
  // zoom fighting the touch controls.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Structured data: lets Google show this as a game in rich results.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Backrooms: Level 0",
  url: SITE,
  image: `${SITE}/opengraph-image.png`,
  description:
    "Free first-person horror game in the browser. Explore a procedurally generated Backrooms maze, collect the 8 pages and escape — while something hunts you by sound.",
  genre: ["Horror", "Survival"],
  playMode: "SinglePlayer",
  gamePlatform: ["Web Browser"],
  applicationCategory: "Game",
  operatingSystem: "Any",
  inLanguage: "en",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  author: {
    "@type": "Person",
    name: "Hashanwickramasooriya",
    url: "https://github.com/Hashanwickramasooriya",
    sameAs: ["https://x.com/Star_Knight12", "https://github.com/Hashanwickramasooriya"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="si"
      className={`${specialElite.variable} ${notoSinhala.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-black text-zinc-200">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <LanguageProvider>
          <SoundSettingsProvider>{children}</SoundSettingsProvider>
        </LanguageProvider>
        {/* Vercel-only — the CrazyGames bundle would just spam 404s */}
        {process.env.CG_EXPORT !== "1" && <Analytics />}
      </body>
    </html>
  );
}
