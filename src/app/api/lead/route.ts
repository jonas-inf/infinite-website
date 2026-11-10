import { handleLead } from "@/lib/lead/handle";
import { SITE } from "@/lib/site";

export const maxDuration = 60; // up to seven GHL calls at 5 s; a slow one is logged with the full lead

export async function POST(req: Request) {
  const r = await handleLead(
    { raw: await req.text(), contentType: req.headers.get("content-type"), origin: req.headers.get("origin"), referer: req.headers.get("referer"),
      userAgent: req.headers.get("user-agent"), ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null },
    { env: process.env, live: SITE.live, fetch, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), log: console.log },
  );
  return r.location ? new Response(null, { status: r.status, headers: { Location: r.location } }) : Response.json(r.json, { status: r.status });
}
