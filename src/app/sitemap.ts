import type { MetadataRoute } from "next";
import { ROUTES, UNLISTED } from "@/lib/pages";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.filter((r) => !UNLISTED.has(r)).map((r) => ({ url: `${SITE.url}${r === "/" ? "" : r}` }));
}
