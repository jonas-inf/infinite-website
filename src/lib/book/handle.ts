// GET /api/slots and POST /api/book: the game plan call, our own calendar UI on one GHL calendar shared by all three
// studios, through the private integration key (never sent to the browser). The lead already went through /api/lead,
// so nothing here can lose it. Never a false "booked": anything uncertain answers `pending`
// and logs enough to rebook by hand. The appointment POST is never retried, because GHL may already have made it.
import { LOCATION_ID, STUDIO_KEYS, STUDIO_NAME, TAG, ghl, parse, spamReason, text, upsertContact, type Deps, type LeadRequest, type StudioKey } from "../lead/handle.ts";

const GHL_API = "https://services.leadconnectorhq.com";
const CAL_VERSION = "2021-04-15";
const TIMEZONE = "America/Chicago";
const CALENDAR_ID = "OZFZcm2DEIZkvX3Bfkuu"; // the game plan call calendar
const DAY = 86_400_000;
const DAYS_AHEAD = 14; // search window
const DAYS_SHOWN = 5; // the next five days with open times
const MAX_BODY = 64 * 1024;
const LIMIT = 5; // bookings per IP per window, per server instance
const WINDOW_MS = 10 * 60_000;
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?[+-]\d{2}:\d{2}$/;

type Day = { date: string; slots: string[] };
export type BookRequest = LeadRequest & { ip: string };
export type BookResponse = { status: number; json: { ok: boolean; preview?: boolean; booked?: boolean; pending?: boolean; reason?: string; missing?: string; start?: string; days?: Day[] } };

const hits = new Map<string, number[]>();
function limited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.size > 5000) hits.clear();
  hits.set(ip, [...recent, now]);
  return recent.length >= LIMIT;
}

async function freeSlots(d: Deps, token: string, from: number, to: number): Promise<Day[]> {
  const q = new URLSearchParams({ startDate: String(from), endDate: String(to), timezone: TIMEZONE });
  const res = await ghl(d, token, `/calendars/${CALENDAR_ID}/free-slots?${q}`, "GET", undefined, CAL_VERSION);
  if (!res.ok) throw new Error(`free-slots ${res.status}`);
  const body = (await res.json()) as Record<string, { slots?: unknown } | null>;
  return Object.keys(body)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .map((date) => ({ date, slots: (Array.isArray(body[date]?.slots) ? body[date].slots : []).filter((s): s is string => typeof s === "string") }))
    .filter((day) => day.slots.length);
}

const nextDays = async (d: Deps, token: string) => {
  const now = Date.now();
  return (await freeSlots(d, token, now, now + DAYS_AHEAD * DAY)).slice(0, DAYS_SHOWN);
};

export async function handleSlots(d: Deps): Promise<BookResponse> {
  const token = d.env.GHL_PIT_TOKEN;
  if (!token) return d.live ? { status: 503, json: { ok: false } } : { status: 200, json: { ok: true, preview: true, days: [] } };
  try {
    return { status: 200, json: { ok: true, days: await nextDays(d, token) } };
  } catch (err) {
    d.log(`[book] slots failed: ${String(err)}`);
    return { status: 502, json: { ok: false } };
  }
}

export async function handleBook(req: BookRequest, d: Deps): Promise<BookResponse> {
  const pending: BookResponse = { status: 200, json: { ok: true, pending: true } };
  const isJson = !!req.contentType?.includes("application/json");
  const b = req.raw.length > MAX_BODY ? null : parse(req.raw, req.contentType);
  if (!b) {
    d.log(`[book] INCOMPLETE unreadable body: ${req.raw.slice(0, 8192)}`);
    return { status: 400, json: { ok: false } };
  }
  const reason = spamReason(b, req, isJson, d.live);
  if (reason) {
    d.log(`[book] silent-drop ${JSON.stringify({ reason, body: b })}`);
    return pending;
  }
  if (limited(req.ip, Date.now())) {
    d.log(`[book] rate-limited, rebook by hand if real: ${JSON.stringify(b)}`);
    return pending;
  }
  const key = text(b.studio) as StudioKey;
  const start = text(b.start);
  const missing = !STUDIO_KEYS.includes(key) ? "studio" : !ISO_OFFSET.test(start) ? "start" : ["first_name", "email", "phone"].find((f) => !text(b[f]));
  if (missing) {
    d.log(`[book] INCOMPLETE missing ${missing}: ${JSON.stringify(b)}`);
    return { status: 400, json: { ok: false, missing } };
  }
  d.log(`[book] received ${JSON.stringify({ location: key, receivedAt: new Date().toISOString(), body: b })}`);

  const token = d.env.GHL_PIT_TOKEN;
  if (!token) {
    if (!d.live) return { status: 200, json: { ok: true, preview: true, start } };
    d.log(`[book] DELIVERY FAILED no calendar credentials on the live site, rebook by hand: ${JSON.stringify(b)}`);
    return pending;
  }
  try {
    const ms = Date.parse(start);
    const open = (await freeSlots(d, token, ms - 60_000, ms + DAY)).some((day) => day.slots.some((s) => Date.parse(s) === ms));
    if (!open) return { status: 409, json: { ok: false, reason: "slot_taken", days: await nextDays(d, token) } };

    const { id, phoneNote } = await upsertContact(d, token, key, b);
    const who = [text(b.first_name), text(b.last_name)].filter(Boolean).join(" ");
    const made = await d.fetch(`${GHL_API}/calendars/events/appointments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Version: CAL_VERSION, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      // endTime and the assigned person come from the calendar's own settings
      body: JSON.stringify({
        calendarId: CALENDAR_ID, locationId: LOCATION_ID, contactId: id, startTime: start,
        title: `Game Plan Call: ${who} (${STUDIO_NAME[key]})`,
        description: [`Studio: ${STUDIO_NAME[key]}`, text(b.interest) === "pricing" ? "Asked for pricing on the website." : "Asked for a free 1-1 session on the website.", phoneNote].filter(Boolean).join("\n"),
        appointmentStatus: "confirmed", toNotify: true, ignoreFreeSlotValidation: false,
      }),
    });
    if (!made.ok) throw new Error(`appointment ${made.status}`);
    // The appointment exists now, so a failed tag must not read as a failed booking
    await ghl(d, token, `/contacts/${id}/tags`, "POST", { tags: ["website-game-plan", TAG[key]] })
      .then((r) => { if (!r.ok) throw new Error(`tags ${r.status}`); })
      .catch((err) => d.log(`[book] TAGS FAILED contact ${id}, add by hand: ${String(err)}`));
    const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(ms);
    await ghl(d, token, `/contacts/${id}/notes`, "POST", { body: `📅 GAME PLAN CALL BOOKED on the website — ${when} · ${STUDIO_NAME[key]}` })
      .then((r) => { if (!r.ok) throw new Error(`note ${r.status}`); })
      .catch((err) => d.log(`[book] NOTE FAILED contact ${id}: ${String(err)}`));
    return { status: 200, json: { ok: true, booked: true, start } };
  } catch (err) {
    d.log(`[book] DELIVERY FAILED ${String(err)}, check the calendar then rebook by hand: ${JSON.stringify(b)}`);
    return pending;
  }
}
