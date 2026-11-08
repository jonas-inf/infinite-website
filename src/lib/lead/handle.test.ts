import assert from "node:assert/strict";
import { test } from "node:test";
import { handleLead, type Deps, type Pins } from "./handle.ts";

const PINS: Pins = { shoal_creek: "LOC_SC", steiner_ranch: "LOC_SR", round_rock: "LOC_RR" };
const ENV = {
  GHL_PIT_TOKEN_SHOAL_CREEK: "tok-sc", GHL_LOCATION_ID_SHOAL_CREEK: "LOC_SC",
  GHL_PIT_TOKEN_STEINER_RANCH: "tok-sr", GHL_LOCATION_ID_STEINER_RANCH: "LOC_SR",
  GHL_PIT_TOKEN_ROUND_ROCK: "tok-rr", GHL_LOCATION_ID_ROUND_ROCK: "LOC_RR",
};
type Call = { url: string; method: string; token: string; body: Record<string, unknown> };
function deps(over: Partial<Deps> = {}, respond?: (c: Call, n: number) => Response) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const d: Deps = {
    env: ENV, pins: PINS, live: false, sleep: async () => {},
    log: (l) => logs.push(l),
    fetch: async (url, init) => {
      const c = { url: String(url), method: init?.method ?? "GET", token: String((init?.headers as Record<string, string>).Authorization), body: init?.body ? JSON.parse(String(init.body)) : {} };
      calls.push(c);
      return respond ? respond(c, calls.length) : Response.json({ contact: { id: "c1" } });
    },
    ...over,
  };
  return { d, calls, logs };
}
const lead = (o: Record<string, unknown> = {}) => ({ studio: "shoal_creek", first_name: "Ann", email: "a@example.com", phone: "5125550100", elapsed_ms: 5000, ...o });
const req = (b: unknown, o: Partial<Parameters<typeof handleLead>[0]> = {}) => ({ raw: JSON.stringify(b), contentType: "application/json", origin: "http://localhost:3030", referer: null, ...o });

for (const [key, tok, loc, tag] of [["shoal_creek", "tok-sc", "LOC_SC", "website-shoal-creek"], ["steiner_ranch", "tok-sr", "LOC_SR", "website-steiner-ranch"], ["round_rock", "tok-rr", "LOC_RR", "website-round-rock"]]) {
  test(`${key} delivers only with its own token, location and tag`, async () => {
    const { d, calls } = deps();
    const r = await handleLead(req(lead({ studio: key })), d);
    assert.deepEqual(r.json, { ok: true, delivered: true });
    assert.ok(calls.length >= 2);
    assert.ok(calls.every((c) => c.token === `Bearer ${tok}`));
    assert.equal(calls[0].body.locationId, loc);
    const tags = calls.filter((c) => c.url.endsWith("/tags") && c.method === "POST").flatMap((c) => c.body.tags as string[]);
    assert.deepEqual(tags.sort(), ["website-lead", tag].sort());
    assert.equal(calls[0].body.tags, undefined);
  });
}

test("unset credentials answer preview and call nothing", async () => {
  const { d, calls } = deps({ env: {} });
  const r = await handleLead(req(lead()), d);
  assert.deepEqual(r.json, { ok: true, preview: true });
  assert.equal(calls.length, 0);
});
test("one studio's missing credentials never fall back to another's", async () => {
  const env = { ...ENV, GHL_PIT_TOKEN_ROUND_ROCK: "" };
  const { d, calls } = deps({ env });
  const r = await handleLead(req(lead({ studio: "round_rock" })), d);
  assert.deepEqual(r.json, { ok: true, preview: true });
  assert.equal(calls.length, 0);
});
test("env location differing from the pin is refused with zero calls", async () => {
  const { d, calls, logs } = deps({ env: { ...ENV, GHL_LOCATION_ID_SHOAL_CREEK: "LOC_SR" } });
  const r = await handleLead(req(lead()), d);
  assert.equal(r.json.ok, true);
  assert.equal(calls.length, 0);
  assert.ok(logs.some((l) => l.includes("REFUSED")));
});
test("a null pin is refused with zero calls", async () => {
  const { d, calls } = deps({ pins: { ...PINS, shoal_creek: null } });
  await handleLead(req(lead()), d);
  assert.equal(calls.length, 0);
});
for (const bad of ["", "roundrock", "Shoal Creek", "shoal-creek", "__proto__", "constructor", null, 7]) {
  test(`studio ${JSON.stringify(bad)} is a 400`, async () => {
    const { d, calls } = deps();
    const r = await handleLead(req(lead({ studio: bad })), d);
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  });
}
test("studio is trimmed", async () => {
  const { d, calls } = deps();
  await handleLead(req(lead({ studio: " steiner_ranch " })), d);
  assert.equal(calls[0].body.locationId, "LOC_SR");
});
test("missing name, email or phone is a logged 400", async () => {
  for (const k of ["first_name", "email", "phone"]) {
    const { d, logs } = deps();
    const r = await handleLead(req(lead({ [k]: "" })), d);
    assert.equal(r.status, 400);
    assert.ok(logs.some((l) => l.includes("INCOMPLETE")));
  }
});
test("honeypot is dropped, logged, answered ok", async () => {
  const { d, calls, logs } = deps();
  const r = await handleLead(req(lead({ hp_extra: "x" })), d);
  assert.equal(r.json.ok, true);
  assert.equal(calls.length, 0);
  assert.ok(logs.some((l) => l.includes("silent-drop")));
});
test("a sub-1.5 s JSON post is dropped", async () => {
  const { d, calls } = deps();
  await handleLead(req(lead({ elapsed_ms: 400 })), d);
  assert.equal(calls.length, 0);
});
test("a foreign origin is dropped", async () => {
  const { d, calls } = deps();
  await handleLead(req(lead(), { origin: "https://evil.example" }), d);
  assert.equal(calls.length, 0);
});
test("localhost is refused once live; the apex passes", async () => {
  const a = deps({ live: true });
  await handleLead(req(lead()), a.d);
  assert.equal(a.calls.length, 0);
  const b = deps({ live: true });
  await handleLead(req(lead(), { origin: "https://infinitefitnessaustin.com" }), b.d);
  assert.ok(b.calls.length > 0);
});
test("a body over 64 KB sends nothing", async () => {
  const { d, calls } = deps();
  const r = await handleLead(req(lead({ first_name: "x".repeat(70000) })), d);
  assert.equal(r.json.ok, true);
  assert.equal(calls.length, 0);
});
test("unreadable JSON is a 400", async () => {
  const { d } = deps();
  const r = await handleLead({ raw: "{nope", contentType: "application/json", origin: null, referer: null }, d);
  assert.equal(r.status, 400);
});
test("interest=pricing adds the pricing tag; other values are ignored", async () => {
  const tagsFor = async (interest: string) => {
    const { d, calls } = deps();
    await handleLead(req(lead({ interest })), d);
    return calls.filter((c) => c.url.endsWith("/tags") && c.method === "POST").flatMap((c) => c.body.tags as string[]);
  };
  assert.ok((await tagsFor("pricing")).includes("website-pricing"));
  assert.ok(!(await tagsFor("nonsense")).includes("website-pricing"));
});
test("the trigger tag is removed before it is added, so returning contacts re-fire", async () => {
  const { d, calls } = deps();
  await handleLead(req(lead()), d);
  const del = calls.findIndex((c) => c.method === "DELETE");
  const add = calls.findIndex((c) => c.url.endsWith("/tags") && c.method === "POST");
  assert.ok(del > 0 && del < add);
});
test("GHL 429 retries once", async () => {
  const { d, calls } = deps({}, (_c, n) => (n === 1 ? new Response("", { status: 429 }) : Response.json({ contact: { id: "c1" } })));
  const r = await handleLead(req(lead()), d);
  assert.equal(r.json.ok, true);
  assert.equal(calls[0].url, calls[1].url);
});
test("a persistent GHL failure still answers ok and logs the lead", async () => {
  const { d, logs } = deps({}, () => new Response("", { status: 500 }));
  const r = await handleLead(req(lead()), d);
  assert.equal(r.json.ok, true);
  assert.ok(logs.some((l) => l.includes("DELIVERY FAILED") && l.includes("a@example.com")));
});
test("a rejected phone retries without it and keeps the number in the note", async () => {
  const { d, calls } = deps({}, (c, n) => (n === 1 ? new Response("", { status: 422 }) : Response.json({ contact: { id: "c1" } })));
  await handleLead(req(lead()), d);
  assert.equal(calls[1].body.phone, undefined);
  assert.ok(calls.some((c) => c.url.endsWith("/notes") && String(c.body.body).includes("5125550100")));
});
test("a no-JS form post gets a 303 to /thank-you", async () => {
  const { d } = deps();
  const raw = new URLSearchParams({ studio: "round_rock", first_name: "Ann", email: "a@example.com", phone: "5125550100" }).toString();
  const r = await handleLead({ raw, contentType: "application/x-www-form-urlencoded", origin: "http://localhost:3030", referer: null }, d);
  assert.equal(r.status, 303);
  assert.equal(r.location, "/thank-you");
});
test("missing credentials on the live site log a failure and never show the preview note", async () => {
  const { d, calls, logs } = deps({ env: {}, live: true });
  const r = await handleLead(req(lead(), { origin: "https://infinitefitnessaustin.com" }), d);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(calls.length, 0);
  assert.ok(logs.some((l) => l.includes("DELIVERY FAILED") && l.includes("a@example.com")));
});
test("only a real delivery reports delivered", async () => {
  const failed = deps({}, () => new Response("", { status: 500 }));
  assert.equal((await handleLead(req(lead()), failed.d)).json.delivered, undefined);
  const dropped = deps();
  assert.equal((await handleLead(req(lead({ hp_extra: "x" })), dropped.d)).json.delivered, undefined);
});
test("a failed tag reset still adds the tags", async () => {
  const { d, calls } = deps({}, (c) => { if (c.method === "DELETE") throw new Error("timeout"); return Response.json({ contact: { id: "c1" } }); });
  const r = await handleLead(req(lead()), d);
  assert.equal(r.json.delivered, true);
  assert.ok(calls.some((c) => c.url.endsWith("/tags") && c.method === "POST"));
});
test("a failed note is logged with the phone number", async () => {
  const { d, logs } = deps({}, (c, n) => (n === 1 ? new Response("", { status: 422 }) : c.url.endsWith("/notes") ? new Response("", { status: 500 }) : Response.json({ contact: { id: "c1" } })));
  await handleLead(req(lead()), d);
  assert.ok(logs.some((l) => l.includes("NOTE FAILED") && l.includes("5125550100")));
});
