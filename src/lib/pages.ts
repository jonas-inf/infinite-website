import pages from "@/content/generated/pages.json";

export type Page = { title: string; description: string; body: string };
export const PAGES = pages as Record<string, Page>;
// Kept out of search and the sitemap at launch too
export const UNLISTED = new Set(["/thank-you", "/404", "/game-plan15"]);
export const ROUTES = Object.keys(PAGES).filter((r) => r !== "/404");
