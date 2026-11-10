// POST /api/careers (D-076): a job application goes to the shared GHL sub-account as a contact tagged website-careers
// with the application in a note. It never gets a lead tag or a studio location field, so no lead workflow starts.
import { LOCATION_ID, STUDIO_KEYS, STUDIO_NAME, ghl, parse, spamReason, text, type Deps, type LeadRequest, type StudioKey } from "../lead/handle.ts";

export const CAREERS_TAG = "website-careers";
const MAX_BODY = 64 * 1024;

export async function handleCareers(req: LeadRequest, d: Deps): Promise<{ status: number; json: { ok: boolean; preview?: boolean; delivered?: boolean; missing?: string } }> {
  if (req.raw.length > MAX_BODY) {
    d.log(`[careers] silent-drop ${JSON.stringify({ reason: "oversize", body: req.raw.slice(0, 8192) })}`);
    return { status: 200, json: { ok: true } };
  }
  const b = parse(req.raw, req.contentType);
  if (!b) return { status: 400, json: { ok: false } };
  const reason = spamReason(b, req, true, d.live);
  if (reason) {
    d.log(`[careers] silent-drop ${JSON.stringify({ reason, body: b })}`);
    return { status: 200, json: { ok: true } };
  }
  const missing = ["first_name", "email", "phone", "role"].find((f) => !text(b[f]));
  if (missing) return { status: 400, json: { ok: false, missing } };
  const studio = STUDIO_KEYS.includes(text(b.studio) as StudioKey) ? STUDIO_NAME[text(b.studio) as StudioKey] : "Any studio";
  d.log(`[careers] received ${JSON.stringify({ receivedAt: new Date().toISOString(), body: b })}`);

  const token = d.env.GHL_PIT_TOKEN;
  if (!token) {
    if (!d.live) return { status: 200, json: { ok: true, preview: true } };
    d.log(`[careers] DELIVERY FAILED no credentials: ${JSON.stringify(b)}`);
    return { status: 200, json: { ok: true } };
  }
  const note = [
    `💼 CAREERS APPLICATION — ${text(b.role).slice(0, 200)}`,
    `Name: ${[text(b.first_name), text(b.last_name)].filter(Boolean).join(" ")}`,
    `Phone: ${text(b.phone)}`,
    `Email: ${text(b.email)}`,
    `Studio: ${studio}`,
    `Resume or LinkedIn: ${text(b.link).slice(0, 500) || "—"}`,
    "",
    "About them:",
    text(b.about).slice(0, 5000) || "—",
  ].join("\n");
  try {
    const contact = { locationId: LOCATION_ID, firstName: text(b.first_name), lastName: text(b.last_name) || undefined, email: text(b.email), phone: text(b.phone), source: "Website careers" };
    let res = await ghl(d, token, "/contacts/upsert", "POST", contact);
    if (res.status === 400 || res.status === 422) res = await ghl(d, token, "/contacts/upsert", "POST", { ...contact, phone: undefined });
    if (!res.ok) throw new Error(`upsert ${res.status}`);
    const id = ((await res.json()) as { contact?: { id?: string } }).contact?.id;
    if (!id) throw new Error("upsert returned no contact id");
    const noted = await ghl(d, token, `/contacts/${id}/notes`, "POST", { body: note }).catch(() => null);
    if (!noted?.ok) d.log(`[careers] NOTE FAILED contact ${id}, add by hand: ${note}`);
    const tagged = await ghl(d, token, `/contacts/${id}/tags`, "POST", { tags: [CAREERS_TAG] });
    if (!tagged.ok) throw new Error(`tags ${tagged.status}`);
    return { status: 200, json: { ok: true, delivered: true } };
  } catch (err) {
    d.log(`[careers] DELIVERY FAILED ${String(err)}: ${JSON.stringify(b)}`);
    return { status: 200, json: { ok: true } };
  }
}
