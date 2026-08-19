import type { MetadataRoute } from "next";

// Required for `output: "export"` (CrazyGames bundle); no-op otherwise.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://backroom-escape.vercel.app/sitemap.xml",
  };
}
