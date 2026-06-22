import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://promptstudio.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`,        lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
