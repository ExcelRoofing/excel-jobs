import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Excel Jobs",
    short_name: "Excel Jobs",
    description: "Jobs, photos, and customer links for Excel Roofing.",
    start_url: "/jobs",
    scope: "/",
    display: "standalone",
    background_color: "#121a24",
    theme_color: "#121a24",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
