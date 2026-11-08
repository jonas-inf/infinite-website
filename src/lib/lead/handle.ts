// POST /api/lead. Every lead goes to the sub-account of the studio it named, or nowhere: a studio without its own
// credentials is preview mode, never another studio's (D-012). Import-free so `node --test` can check it.
export const STUDIO_KEYS = ["shoal_creek", "steiner_ranch", "round_rock"] as const;
export type StudioKey = (typeof STUDIO_KEYS)[number];
export type Pins = Record<StudioKey, string | null>;

// Each sub-account's location id, pinned here once the client supplies it (D-012). null refuses delivery.
export const LOCATION_PINS: Pins = { shoal_creek: null, steiner_ranch: null, round_rock: null };

const TAG: Record<StudioKey, string> = { shoal_creek: "website-shoal-creek", steiner_ranch: "website-steiner-ranch", round_rock: "website-round-rock" };
const TRIGGER = "website-lead";
const GHL_API = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MAX_BODY = 64 * 1024;
const MIN_MS = 1500;
const LIVE_ORIGINS = ["https://infinitefitnessaustin.com", "https://www.infinitefitnessaustin.com"];

export type Deps = {
  env: Record<string, string | undefined>;
  pins: Pins;
  live: boolean;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};
export type LeadRequest = { raw: string; contentType: string | null; origin: string | null; referer: string | null };
export type LeadResponse = { status: number; json: { ok: boolean; preview?: boolean; delivered?: boolean; missing?: string }; location?: string };
type Body = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function parse(raw: string, contentType: string | null): Body | null {
  if (contentType?.includes("application/json")) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function originAllowed(req: LeadRequest, live: boolean): boolean {
  return [req.origin, req.referer].some((u) => {
    if (!u) return false;
    try {
      const url = new URL(u);
      if (LIVE_ORIGINS.includes(url.origin)) return true;
      return !live && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".vercel.app"));
    } catch {
      return false;
    }
  });
}

function spamReason(b: Body, req: LeadRequest, isJson: boolean, live: boolean): string | null {
  if (text(b.hp_extra)) return "honeypot";
  if (isJson && !(Number(b.elapsed_ms) >= MIN_MS)) return "time-trap";
  if (!originAllowed(req, live)) return "origin";
  return null;
}

async function ghl(d: Deps, token: string, path: string, method: string, body?: unknown): Promise<Response> {
  const call = () =>
    d.fetch(`${GHL_API}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  let res = await call().catch(() => null);
  if (!res || res.status === 429 || res.status >= 500) {
    await d.sleep(1000);
    res = await call();
  }
  return res;
}

async function deliver(d: Deps, key: StudioKey, token: string, locationId: string, b: Body) {
  const contact = { locationId, firstName: text(b.first_name), lastName: text(b.last_name) || undefined, email: text(b.email), phone: text(b.phone), source: "Website" };
  let res = await ghl(d, token, "/contacts/upsert", "POST", contact);
  let note = text(b.interest) === "pricing" ? "Asked for pricing on the website." : "";
  if (res.status === 400 || res.status === 422) {
    note = `${note} Phone as typed: ${contact.phone}`.trim();
    res = await ghl(d, token, "/contacts/upsert", "POST", { ...contact, phone: undefined });
  }
  if (!res.ok) throw new Error(`upsert ${res.status}`);
  const id = ((await res.json()) as { contact?: { id?: string } }).contact?.id;
  if (!id) throw new Error("upsert returned no contact id");
  // Only so a returning contact re-fires the workflow; it must never block the tags below
  await ghl(d, token, `/contacts/${id}/tags`, "DELETE", { tags: [TRIGGER] }).catch((err) => d.log(`[lead] tag reset failed ${id}: ${String(err)}`));
  const tags = [TRIGGER, TAG[key], ...(text(b.interest) === "pricing" ? ["website-pricing"] : [])];
  const added = await ghl(d, token, `/contacts/${id}/tags`, "POST", { tags });
  if (!added.ok) throw new Error(`tags ${added.status}`);
  if (note) {
    const noted = await ghl(d, token, `/contacts/${id}/notes`, "POST", { body: note }).catch(() => null);
    if (!noted?.ok) d.log(`[lead] NOTE FAILED contact ${id}, add by hand: ${note}`);
  }
}

export async function handleLead(req: LeadRequest, d: Deps): Promise<LeadResponse> {
  const isJson = !!req.contentType?.includes("application/json");
  const ok = (extra: { preview?: boolean; delivered?: boolean } = {}): LeadResponse =>
    isJson ? { status: 200, json: { ok: true, ...extra } } : { status: 303, json: { ok: true, ...extra }, location: "/thank-you" };

  if (req.raw.length > MAX_BODY) {
    d.log(`[lead] silent-drop ${JSON.stringify({ reason: "oversize", body: req.raw.slice(0, 8192) })}`);
    return ok();
  }
  const b = parse(req.raw, req.contentType);
  if (!b) {
    d.log(`[lead] INCOMPLETE unreadable body: ${req.raw.slice(0, 8192)}`);
    return { status: 400, json: { ok: false } };
  }
  const reason = spamReason(b, req, isJson, d.live);
  if (reason) {
    d.log(`[lead] silent-drop ${JSON.stringify({ reason, body: b })}`);
    return ok();
  }
  const key = text(b.studio) as StudioKey;
  if (!STUDIO_KEYS.includes(key)) {
    d.log(`[lead] INCOMPLETE bad studio: ${JSON.stringify(b)}`);
    return { status: 400, json: { ok: false, missing: "studio" } };
  }
  const missing = ["first_name", "email", "phone"].find((f) => !text(b[f]));
  if (missing) {
    d.log(`[lead] INCOMPLETE missing ${missing}: ${JSON.stringify(b)}`);
    return { status: 400, json: { ok: false, missing } };
  }
  d.log(`[lead] received ${JSON.stringify({ location: key, receivedAt: new Date().toISOString(), body: b })}`);

  const token = d.env[`GHL_PIT_TOKEN_${key.toUpperCase()}`];
  const locationId = d.env[`GHL_LOCATION_ID_${key.toUpperCase()}`];
  if (!token || !locationId) {
    if (!d.live) return ok({ preview: true });
    d.log(`[lead] DELIVERY FAILED no credentials for ${key} on the live site: ${JSON.stringify(b)}`);
    return ok();
  }
  if (d.pins[key] !== locationId) {
    d.log(`[lead] REFUSED location id does not match the pin for ${key}: ${JSON.stringify(b)}`);
    return ok();
  }
  try {
    await deliver(d, key, token, locationId, b);
    return ok({ delivered: true });
  } catch (err) {
    d.log(`[lead] DELIVERY FAILED ${key} ${String(err)}: ${JSON.stringify(b)}`);
    return ok();
  }
}
