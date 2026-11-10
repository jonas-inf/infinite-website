import assert from "node:assert/strict";
import { test } from "node:test";
import type { Deps } from "../lead/handle.ts";
import { handleBook, handleSlots, type BookRequest } from "./handle.ts";

const ENV = { GHL_PIT_TOKEN: "tok-cal" };
const SLOT = "2099-01-05T10:00:00-06:00";
const FREE = { "2099-01-05": { slots: [SLOT] }, "2099-01-06": { slots: [] }, traceId: "x" };
type Call = { url: string; method: string; version: string; token: string; body: Record<string, unknown> };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

function deps(over: Partial<Deps> = {}, respond?: (c: Call) => Response | null) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const d: Deps = {
    env: ENV, live: false, sleep: async () => {}, log: (l) => logs.push(l),
    fetch: async (url, init) => {
      const h = init?.headers as Record<string, string>;
      const c = { url: String(url), method: init?.method ?? "GET", version: h.Version, token: h.Authorization, body: init?.body ? JSON.parse(String(init.body)) : {} };
      calls.push(c);
      const r = respond?.(c);
      if (r) return r;
      if (c.url.includes("/free-slots")) return json(FREE);
      if (c.url.endsWith("/contacts/upsert")) return json({ contact: { id: "C1" } });
      return json({ id: "A1" });
    },
    ...over,
  };
  return { d, calls, logs };
}

let ip = 0;
const request = (over: Record<string, unknown> = {}): BookRequest => ({
  raw: JSON.stringify({ studio: "steiner_ranch", first_name: "Pat", last_name: "Lee", email: "pat@example.com", phone: "5125550100", elapsed_ms: 9000, start: SLOT, ...over }),
  contentType: "application/json", origin: "http://localhost:3030", referer: null, ip: `ip-${++ip}`,
});
const appointment = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/calendars/events/appointments"));

test("slots: Central time, days with open times only, token stays server-side", async () => {
  const { d, calls } = deps();
  const r = await handleSlots(d);
  assert.deepEqual(r.json.days, [{ date: "2099-01-05", slots: [SLOT] }]);
  assert.ok(calls[0].url.includes("/calendars/OZFZcm2DEIZkvX3Bfkuu/free-slots") && calls[0].url.includes("timezone=America%2FChicago"));
  assert.equal(calls[0].version, "2021-04-15");
  assert.ok(!JSON.stringify(r.json).includes("tok-cal"));
});

test("slots: only the next five open days", async () => {
  const many = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`2099-01-1${i}`, { slots: [`2099-01-1${i}T09:00:00-06:00`] }]));
  const { d } = deps({}, (c) => (c.url.includes("/free-slots") ? json(many) : null));
  assert.equal((await handleSlots(d)).json.days?.length, 5);
});

test("slots: no credentials is preview off the live site and unavailable on it", async () => {
  assert.deepEqual((await handleSlots(deps({ env: {} }).d)).json, { ok: true, preview: true, days: [] });
  assert.equal((await handleSlots(deps({ env: {}, live: true }).d)).status, 503);
});

test("book: re-checks the slot, books once on the shared calendar and names the studio", async () => {
  const { d, calls } = deps();
  const r = await handleBook(request(), d);
  assert.deepEqual(r.json, { ok: true, booked: true, start: SLOT });
  const [a] = appointment(calls);
  assert.equal(a.body.calendarId, "OZFZcm2DEIZkvX3Bfkuu");
  assert.equal(a.body.locationId, "JDjtGIq6vm95CBfpbfKs");
  assert.equal(a.body.contactId, "C1");
  assert.equal(a.body.startTime, SLOT);
  assert.equal(a.body.title, "Game Plan Call: Pat Lee (Steiner Ranch)");
  assert.equal(a.token, "Bearer tok-cal");
  assert.deepEqual(calls.find((c) => c.url.endsWith("/tags"))?.body.tags, ["website-game-plan", "steiner"]);
  assert.match(String(calls.find((c) => c.url.endsWith("/notes"))?.body.body), /^📅 GAME PLAN CALL BOOKED .*Steiner Ranch$/);
  assert.ok(calls.findIndex((c) => c.url.includes("/free-slots")) < calls.indexOf(a));
});

test("book: a taken slot books nothing and returns fresh times", async () => {
  const { d, calls } = deps({}, (c) => (c.url.includes("/free-slots") ? json({ "2099-01-07": { slots: ["2099-01-07T09:00:00-06:00"] } }) : null));
  const r = await handleBook(request(), d);
  assert.equal(r.status, 409);
  assert.equal(r.json.reason, "slot_taken");
  assert.equal(r.json.days?.[0].date, "2099-01-07");
  assert.equal(appointment(calls).length, 0);
});

test("book: a failed appointment is never retried and never reads as booked", async () => {
  const { d, calls, logs } = deps({}, (c) => (c.url.endsWith("/appointments") ? json({}, 500) : null));
  const r = await handleBook(request(), d);
  assert.deepEqual(r.json, { ok: true, pending: true });
  assert.equal(appointment(calls).length, 1);
  assert.ok(logs.some((l) => l.includes("DELIVERY FAILED") && l.includes("pat@example.com")));
});

test("book: a failed tag still counts as booked and is logged", async () => {
  const { d, logs } = deps({}, (c) => (c.url.endsWith("/tags") ? json({}, 400) : null));
  assert.equal((await handleBook(request(), d)).json.booked, true);
  assert.ok(logs.some((l) => l.includes("TAGS FAILED")));
});

test("book: the honeypot books nothing and answers without a booking", async () => {
  const { d, calls } = deps();
  assert.deepEqual((await handleBook(request({ hp_extra: "x" }), d)).json, { ok: true, pending: true });
  assert.equal(calls.length, 0);
});

test("book: a bad time or studio is refused before any GHL call", async () => {
  const { d, calls } = deps();
  assert.equal((await handleBook(request({ start: "tomorrow" }), d)).json.missing, "start");
  assert.equal((await handleBook(request({ studio: "austin" }), d)).json.missing, "studio");
  assert.equal(calls.length, 0);
});

test("book: no credentials is preview off the live site and logged for rebooking on it", async () => {
  assert.equal((await handleBook(request(), deps({ env: {} }).d)).json.preview, true);
  const live = deps({ env: {}, live: true });
  const r = await handleBook({ ...request(), origin: "https://infinitefitnessaustin.com" }, live.d);
  assert.equal(r.json.pending, true);
  assert.ok(live.logs.some((l) => l.includes("DELIVERY FAILED")));
});

test("book: the sixth booking from one IP in the window books nothing", async () => {
  const { d, calls } = deps();
  const req = request();
  for (let i = 0; i < 5; i++) assert.equal((await handleBook(req, d)).json.booked, true);
  assert.equal((await handleBook(req, d)).json.pending, true);
  assert.equal(appointment(calls).length, 5);
});
