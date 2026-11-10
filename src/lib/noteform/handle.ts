// Non-lead forms (D-076): careers applications go to the shared GHL sub-account as a
// contact with one tag and the answers in a note. They never get a lead tag or a studio location field, so no lead
// workflow starts.
import { LOCATION_ID, STUDIO_KEYS, STUDIO_NAME, ghl, parse, spamReason, text, type Deps, type LeadRequest, type StudioKey } from "../lead/handle.ts";

type Body = Record<string, unknown>;
type Form = { name: string; tag: string; source: string; required: string[]; note: (b: Body, studio: string) => string[] };
type Result = { status: number; json: { ok: boolean; preview?: boolean; delivered?: boolean; missing?: string } };
const MAX_BODY = 64 * 1024;
const who = (b: Body) => [`Name: ${[text(b.first_name), text(b.last_name)].filter(Boolean).join(" ")}`, `Phone: ${text(b.phone)}`, `Email: ${text(b.email)}`];
const answer = (b: Body, k: string) => text(b[k]).slice(0, 5000) || "—";

export const CAREERS: Form = {
  name: "careers", tag: "website-careers", source: "Website careers", required: ["first_name", "email", "phone", "role"],
  note: (b, studio) => [`💼 CAREERS APPLICATION — ${text(b.role).slice(0, 200)}`, ...who(b), `Studio: ${studio}`, `Resume or LinkedIn: ${text(b.link).slice(0, 500) || "—"}`, "", "About them:", answer(b, "about")],
};
export async function handleNoteForm(form: Form, req: LeadRequest, d: Deps): Promise<Result> {
  if (req.raw.length > MAX_BODY) {
    d.log(`[${form.name}] silent-drop ${JSON.stringify({ reason: "oversize", body: req.raw.slice(0, 8192) })}`);
    return { status: 200, json: { ok: true } };
  }
  const b = parse(req.raw, req.contentType);
  if (!b) return { status: 400, json: { ok: false } };
  const reason = spamReason(b, req, true, d.live);
  if (reason) {
    d.log(`[${form.name}] silent-drop ${JSON.stringify({ reason, body: b })}`);
    return { status: 200, json: { ok: true } };
  }
  const known = STUDIO_KEYS.includes(text(b.studio) as StudioKey);
  const missing = form.required.find((f) => (f === "studio" ? !known : !text(b[f])));
  if (missing) return { status: 400, json: { ok: false, missing } };
  const studio = known ? STUDIO_NAME[text(b.studio) as StudioKey] : "Any studio";
  d.log(`[${form.name}] received ${JSON.stringify({ receivedAt: new Date().toISOString(), body: b })}`);

  const token = d.env.GHL_PIT_TOKEN;
  if (!token) {
    if (!d.live) return { status: 200, json: { ok: true, preview: true } };
    d.log(`[${form.name}] DELIVERY FAILED no credentials: ${JSON.stringify(b)}`);
    return { status: 200, json: { ok: true } };
  }
  const note = form.note(b, studio).join("\n");
  try {
    const contact = { locationId: LOCATION_ID, firstName: text(b.first_name), lastName: text(b.last_name) || undefined, email: text(b.email), phone: text(b.phone), source: form.source };
    let res = await ghl(d, token, "/contacts/upsert", "POST", contact);
    if (res.status === 400 || res.status === 422) res = await ghl(d, token, "/contacts/upsert", "POST", { ...contact, phone: undefined });
    if (!res.ok) throw new Error(`upsert ${res.status}`);
    const id = ((await res.json()) as { contact?: { id?: string } }).contact?.id;
    if (!id) throw new Error("upsert returned no contact id");
    const noted = await ghl(d, token, `/contacts/${id}/notes`, "POST", { body: note }).catch(() => null);
    if (!noted?.ok) d.log(`[${form.name}] NOTE FAILED contact ${id}, add by hand: ${note}`);
    const tagged = await ghl(d, token, `/contacts/${id}/tags`, "POST", { tags: [form.tag] });
    if (!tagged.ok) throw new Error(`tags ${tagged.status}`);
    return { status: 200, json: { ok: true, delivered: true } };
  } catch (err) {
    d.log(`[${form.name}] DELIVERY FAILED ${String(err)}: ${JSON.stringify(b)}`);
    return { status: 200, json: { ok: true } };
  }
}
