import type { MetadataRoute } from "next";

// Required for `output: "export"` (CrazyGames bundle); no-op otherwise.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "අඳුරු මංසන්ධිය",
    short_name: "අඳුරු මංසන්ධිය",
    description: "නිමක් නැති මාවතකින් පිටවීමක් සොයන්න.",
    start_url: "/",
    // Installed-to-home-screen runs with zero browser chrome — the only
    // route to true fullscreen on iPhones, where the Fullscreen API is N/A.
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0a0905",
    theme_color: "#0a0905",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
