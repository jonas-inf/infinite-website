import { handleBook } from "@/lib/book/handle";
import { SITE } from "@/lib/site";

export const maxDuration = 60; // free-slots, upsert and tags at 5 s, each retried once, plus the 10 s appointment

export async function POST(req: Request) {
  const r = await handleBook(
    { raw: await req.text(), contentType: req.headers.get("content-type"), origin: req.headers.get("origin"), referer: req.headers.get("referer"), ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" },
    { env: process.env, live: SITE.live, fetch, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), log: console.log },
  );
  return Response.json(r.json, { status: r.status });
}
