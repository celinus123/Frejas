import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/support", "/privacy", "/terms"].map((p) => ({ url: `https://frejas.app${p}`, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : 0.5 }));
}
