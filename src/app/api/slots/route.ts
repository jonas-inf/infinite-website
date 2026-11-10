import { handleSlots } from "@/lib/book/handle";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await handleSlots({ env: process.env, live: SITE.live, fetch, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), log: console.log });
  // A stale time is safe: /api/book checks it again before booking
  return Response.json(r.json, { status: r.status, headers: { "Cache-Control": r.status === 200 ? "public, s-maxage=30" : "no-store" } });
}
