import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frejas",
    short_name: "Frejas",
    description: "Small habits, better together.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4f3",
    theme_color: "#4c5b48",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
