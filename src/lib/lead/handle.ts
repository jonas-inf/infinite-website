// POST /api/lead. All three studios share one GHL sub-account (D-066): each lead carries its own studio in the location
// field and a studio tag, and a bad studio is refused, never guessed. Import-free so `node --test` can check it.
export const STUDIO_KEYS = ["shoal_creek", "steiner_ranch", "round_rock"] as const;
export type StudioKey = (typeof STUDIO_KEYS)[number];

export const LOCATION_ID = "JDjtGIq6vm95CBfpbfKs"; // the grouped sub-account for all three studios
const STUDIO_FIELD = "q1E72JUxRsPlma4Rq5Q4"; // "Select your preferred Infinite Fitness Location"; its options are these names
const STUDIO_FIELD_2 = "85UFCvQ59zDfMLF6iluC"; // "Choose Your Location"; its options are these names plus ", TX" (D-072)
export const STUDIO_NAME: Record<StudioKey, string> = { shoal_creek: "Shoal Creek", steiner_ranch: "Steiner Ranch", round_rock: "Round Rock" };

// The account's existing plain location tags; the only studio tag a website contact gets (D-079)
export const LOCATION_TAG: Record<StudioKey, string> = { shoal_creek: "shoal creek", steiner_ranch: "steiner", round_rock: "round rock" };
const TRIGGER = "website-lead";
const GHL_API = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MAX_BODY = 64 * 1024;
const MIN_MS = 1500;
const LIVE_ORIGINS = ["https://infinitefitnessaustin.com", "https://www.infinitefitnessaustin.com"];

export type Deps = {
  env: Record<string, string | undefined>;
  live: boolean;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};
export type LeadRequest = { raw: string; contentType: string | null; origin: string | null; referer: string | null; userAgent?: string | null; ip?: string | null };
export type LeadResponse = { status: number; json: { ok: boolean; preview?: boolean; delivered?: boolean; missing?: string }; location?: string };
type Body = Record<string, unknown>;

export const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parse(raw: string, contentType: string | null): Body | null {
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

export function spamReason(b: Body, req: LeadRequest, isJson: boolean, live: boolean): string | null {
  if (text(b.hp_extra)) return "honeypot";
  if (isJson && !(Number(b.elapsed_ms) >= MIN_MS)) return "time-trap";
  if (!originAllowed(req, live)) return "origin";
  return null;
}

export async function ghl(d: Deps, token: string, path: string, method: string, body?: unknown, version = GHL_VERSION): Promise<Response> {
  const call = () =>
    d.fetch(`${GHL_API}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, Version: version, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  let res = await call().catch(() => null);
  if (!res || res.status === 429 || res.status >= 500) {
    await d.sleep(1000);
    res = await call();
  }
  return res;
}

// D-071: the "Website Attribution" folder (made by tools/web/ghl-setup.mjs) is filled by name, once,
// when the website creates the contact; every submission also gets a note that starts with NOTE_MARKER.
const NOTE_MARKER = "🌐 WEBSITE LEAD"; // submission numbers count notes that start with it
const PARAMS: [string, string][] = [
  ["utm_source", "UTM Source"], ["utm_medium", "UTM Medium"], ["utm_campaign", "UTM Campaign"], ["utm_term", "UTM Term"], ["utm_content", "UTM Content"],
  ["gclid", "Google Click ID"], ["gbraid", "GBRAID"], ["wbraid", "WBRAID"], ["fbclid", "Facebook Click ID"], ["msclkid", "Microsoft Click ID"],
];
const FORM_NAME: Record<string, string> = { home: "Home page form", st: "Studio page form", bk: "Book page form", dr: "Booking drawer", pr: "Pricing pop-up" };
const CT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

const toUrl = (v: unknown) => { try { return new URL(text(v)); } catch { return null; } };
const dash = (v: string) => v || "—";

// The page the form was sent from wins, then the page the visit started on, so a click id survives browsing
export function attribution(b: Body): Record<string, string> {
  const page = toUrl(b.page), land = toUrl(b.landing_url);
  return Object.fromEntries(PARAMS.map(([k]) => [k, (page?.searchParams.get(k) || land?.searchParams.get(k) || "").trim().slice(0, 500)]));
}

function channel(a: Record<string, string>, referrer: string, siteHost: string): string {
  if (a.gclid || a.gbraid || a.wbraid) return "Google Ads (paid search)";
  if (a.msclkid) return "Microsoft Ads (paid search)";
  if (/^(fb|facebook|ig|instagram|meta)$/i.test(a.utm_source) && /^(cpc|ppc|paid|paid[_-]?social|paidsocial|ads?)$/i.test(a.utm_medium)) return "Meta Ads (paid social)";
  if (a.utm_source) return `UTM-tagged: ${a.utm_source}${a.utm_medium ? ` / ${a.utm_medium}` : ""}`;
  if (a.fbclid) return "Facebook / Instagram (fbclid, no UTMs)";
  const ref = toUrl(referrer)?.hostname.replace(/^www\./, "") ?? "";
  if (ref && ref !== siteHost) {
    if (/(^|\.)(google|bing|yahoo|duckduckgo|ecosia|brave)\./i.test(ref)) return `Organic search (${ref})`;
    if (/(^|\.)(facebook|instagram|t|twitter|x|linkedin|tiktok|youtube|reddit|pinterest|nextdoor)\.(com|co)$/i.test(ref)) return `Organic social (${ref})`;
    return `Referral (${ref})`;
  }
  return "Direct (no referrer, no UTMs)";
}

function device(ua: string): string {
  if (!ua) return "unknown";
  const kind = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
    : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /CrOS/.test(ua) ? "Chromebook" : "Other";
  const browser = /FBAN|FBAV/.test(ua) ? "Facebook in-app browser" : /Instagram/.test(ua) ? "Instagram in-app browser" : /Edg\//.test(ua) ? "Edge"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  return `${kind} · ${browser}`;
}

function since(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function firstTouch(key: StudioKey, b: Body): Record<string, string> {
  const a = attribution(b);
  return {
    ...Object.fromEntries(PARAMS.map(([k, name]) => [name, a[k]])),
    "Landing Page URL": text(b.landing_url).slice(0, 2000), "Conversion Page URL": text(b.page).slice(0, 2000), Referrer: text(b.referrer).slice(0, 500),
    "Lead Form": FORM_NAME[text(b.form)] ?? "Website form", "Website Studio": STUDIO_NAME[key],
  };
}

export function leadNote(key: StudioKey, b: Body, req: LeadRequest, submission: number, phoneRefused: boolean, now = new Date()): string {
  const a = attribution(b);
  const siteHost = toUrl(b.page)?.hostname.replace(/^www\./, "") ?? "infinitefitnessaustin.com";
  const landed = Number(b.landed_at);
  return [
    `${NOTE_MARKER} — Infinite Fitness ${STUDIO_NAME[key]}`,
    `Submitted: ${CT.format(now)}`,
    submission === 0 ? "Submission # unknown (note count failed)" : submission === 1 ? "Submission #1 for this contact (new website lead)" : `Submission #${submission} for this contact (returning lead)`,
    `Channel: ${channel(a, text(b.referrer), siteHost)}`,
    "",
    "— LEAD —",
    `Name: ${dash([text(b.first_name), text(b.last_name)].filter(Boolean).join(" "))}`,
    `Phone: ${dash(text(b.phone))}${phoneRefused ? " (GHL refused this number, so it is only here)" : ""}`,
    `Email: ${dash(text(b.email))}`,
    `Studio: ${STUDIO_NAME[key]}`,
    `Form: ${FORM_NAME[text(b.form)] ?? "Website form"}`,
    `Asked for: ${text(b.interest) === "pricing" ? "Pricing" : "A free 1-1 session"}`,
    "",
    "— ATTRIBUTION —",
    `utm_source: ${dash(a.utm_source)} · utm_medium: ${dash(a.utm_medium)}`,
    `utm_campaign: ${dash(a.utm_campaign)}`,
    `utm_term: ${dash(a.utm_term)} · utm_content: ${dash(a.utm_content)}`,
    `gclid: ${dash(a.gclid)}`,
    `gbraid: ${dash(a.gbraid)} · wbraid: ${dash(a.wbraid)}`,
    `fbclid: ${dash(a.fbclid)} · msclkid: ${dash(a.msclkid)}`,
    "",
    "— JOURNEY —",
    `Landing page: ${dash(text(b.landing_url))}`,
    `Conversion page: ${dash(text(b.page))}`,
    `Referrer: ${dash(text(b.referrer))}`,
    `Landed: ${landed ? CT.format(new Date(landed)) : "—"}`,
    `Time on site before submit: ${landed ? since(now.getTime() - landed) : "unknown"}`,
    "",
    "— TECH —",
    `Device: ${device(req.userAgent ?? "")}`,
    `IP: ${dash(req.ip ?? "")}`,
    `User agent: ${dash(req.userAgent ?? "")}`,
    `Delivered via: GHL API (Private Integration) · ${siteHost}`,
  ].join("\n");
}

// A phone GHL refuses must not lose the contact: it goes in again without one and the caller notes the number
export async function upsertContact(d: Deps, token: string, key: StudioKey, b: Body) {
  const contact = {
    locationId: LOCATION_ID, firstName: text(b.first_name), lastName: text(b.last_name) || undefined, email: text(b.email), phone: text(b.phone), source: "Website",
    customFields: [{ id: STUDIO_FIELD, value: STUDIO_NAME[key] }, { id: STUDIO_FIELD_2, value: `${STUDIO_NAME[key]}, TX` }],
  };
  let res = await ghl(d, token, "/contacts/upsert", "POST", contact);
  const phoneRefused = res.status === 400 || res.status === 422;
  if (phoneRefused) res = await ghl(d, token, "/contacts/upsert", "POST", { ...contact, phone: undefined });
  if (!res.ok) throw new Error(`upsert ${res.status}`);
  const json = (await res.json()) as { contact?: { id?: string }; new?: boolean };
  const id = json.contact?.id;
  if (!id) throw new Error("upsert returned no contact id");
  return { id, isNew: json.new === true, phoneRefused, phoneNote: phoneRefused ? `Phone as typed: ${contact.phone}` : "" };
}

// Upsert → first-touch fields (new contacts only) → note → tags. Tags go last so the workflow they start already sees
// the fields and the note. Only the upsert and the tags can fail a delivery; the rest is logged and skipped.
async function deliver(d: Deps, key: StudioKey, token: string, b: Body, req: LeadRequest) {
  const { id, isNew, phoneRefused } = await upsertContact(d, token, key, b);
  if (isNew) {
    try {
      const list = await ghl(d, token, `/locations/${LOCATION_ID}/customFields?model=contact`, "GET");
      if (!list.ok) throw new Error(`field list ${list.status}`);
      const ids = new Map(((await list.json()) as { customFields?: { id: string; name: string }[] }).customFields?.map((f) => [f.name.trim(), f.id]) ?? []);
      const customFields = Object.entries(firstTouch(key, b)).flatMap(([name, value]) => (value && ids.has(name) ? [{ id: ids.get(name), value }] : []));
      if (customFields.length) {
        const put = await ghl(d, token, `/contacts/${id}`, "PUT", { customFields });
        if (!put.ok) throw new Error(`fields ${put.status}`);
      }
    } catch (err) {
      d.log(`[lead] FIELDS FAILED contact ${id}: ${String(err)} ${JSON.stringify(firstTouch(key, b))}`);
    }
  }
  let submission = 1;
  if (!isNew) {
    const got = await ghl(d, token, `/contacts/${id}/notes`, "GET").catch(() => null);
    const notes = got?.ok ? (((await got.json().catch(() => ({}))) as { notes?: { body?: string }[] }).notes ?? []) : null;
    submission = notes ? 1 + notes.filter((n) => n.body?.startsWith(NOTE_MARKER)).length : 0;
  }
  const note = leadNote(key, b, req, submission, phoneRefused);
  const noted = await ghl(d, token, `/contacts/${id}/notes`, "POST", { body: note }).catch(() => null);
  if (!noted?.ok) d.log(`[lead] NOTE FAILED contact ${id}, add by hand: ${note}`);
  // Only so a returning contact re-fires the workflow; it must never block the tags below
  await ghl(d, token, `/contacts/${id}/tags`, "DELETE", { tags: [TRIGGER] }).catch((err) => d.log(`[lead] tag reset failed ${id}: ${String(err)}`));
  const tags = [TRIGGER, LOCATION_TAG[key], ...(text(b.interest) === "pricing" ? ["website-pricing"] : [])];
  const added = await ghl(d, token, `/contacts/${id}/tags`, "POST", { tags });
  if (!added.ok) throw new Error(`tags ${added.status}`);
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

  const token = d.env.GHL_PIT_TOKEN;
  if (!token) {
    if (!d.live) return ok({ preview: true });
    d.log(`[lead] DELIVERY FAILED no credentials for ${key} on the live site: ${JSON.stringify(b)}`);
    return ok();
  }
  try {
    await deliver(d, key, token, b, req);
    return ok({ delivered: true });
  } catch (err) {
    d.log(`[lead] DELIVERY FAILED ${key} ${String(err)}: ${JSON.stringify(b)}`);
    return ok();
  }
}
