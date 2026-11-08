import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return SITE.live ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE.url}/sitemap.xml` } : { rules: { userAgent: "*", disallow: "/" } };
}
