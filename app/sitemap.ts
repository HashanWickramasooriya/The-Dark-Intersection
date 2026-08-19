import type { MetadataRoute } from "next";

// Required for `output: "export"` (CrazyGames bundle); no-op otherwise.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://backroom-escape.vercel.app/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
