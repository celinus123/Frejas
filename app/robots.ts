import type { MetadataRoute } from "next";

// Search engines read the website. The app's own pages need a sign-in and have nothing for them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/welcome", "/settings", "/profile", "/archive", "/feed", "/stats", "/challenges", "/habits", "/join/", "/add/"] }],
    sitemap: "https://frejas.app/sitemap.xml",
  };
}
