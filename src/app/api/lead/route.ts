import { LOCATION_PINS, handleLead } from "@/lib/lead/handle";
import { SITE } from "@/lib/site";

export const maxDuration = 60; // five GHL calls at 5 s, each retried once, fit inside this

export async function POST(req: Request) {
  const r = await handleLead(
    { raw: await req.text(), contentType: req.headers.get("content-type"), origin: req.headers.get("origin"), referer: req.headers.get("referer") },
    { env: process.env, pins: LOCATION_PINS, live: SITE.live, fetch, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), log: console.log },
  );
  return r.location ? new Response(null, { status: r.status, headers: { Location: r.location } }) : Response.json(r.json, { status: r.status });
}
