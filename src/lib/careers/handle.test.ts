import assert from "node:assert/strict";
import { test } from "node:test";
import { handleCareers } from "./handle.ts";
import type { Deps } from "../lead/handle.ts";

type Call = { url: string; method: string; body: Record<string, unknown> };
function deps(over: Partial<Deps> = {}, respond?: (c: Call) => Response | null) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const d: Deps = {
    env: { GHL_PIT_TOKEN: "tok" }, live: false, sleep: async () => {}, log: (l) => logs.push(l),
    fetch: async (url, init) => {
      const c = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} };
      calls.push(c);
      return respond?.(c) ?? Response.json({ contact: { id: "c9" } });
    },
    ...over,
  };
  return { d, calls, logs };
}
const app = (o: Record<string, unknown> = {}) => ({ first_name: "Sam", email: "s@example.com", phone: "5125550100", role: "Coach", studio: "round_rock", about: "Ten years coaching.", elapsed_ms: 5000, ...o });
const req = (b: unknown) => ({ raw: JSON.stringify(b), contentType: "application/json", origin: "http://localhost:3030", referer: null });

test("careers: tags website-careers only, notes the application, never writes a lead field", async () => {
  const { d, calls } = deps();
  const r = await handleCareers(req(app()), d);
  assert.deepEqual(r.json, { ok: true, delivered: true });
  assert.equal(calls[0].body.customFields, undefined);
  assert.equal(calls[0].body.source, "Website careers");
  const tags = calls.filter((c) => c.url.endsWith("/tags")).flatMap((c) => c.body.tags as string[]);
  assert.deepEqual(tags, ["website-careers"]);
  const note = String(calls.find((c) => c.url.endsWith("/notes"))?.body.body);
  assert.ok(note.startsWith("💼 CAREERS APPLICATION — Coach"));
  assert.ok(note.includes("Studio: Round Rock") && note.includes("Ten years coaching."));
});
test("careers: an unknown studio reads Any studio", async () => {
  const { d, calls } = deps();
  await handleCareers(req(app({ studio: "any" })), d);
  assert.ok(String(calls.find((c) => c.url.endsWith("/notes"))?.body.body).includes("Studio: Any studio"));
});
test("careers: missing role is a 400 and calls nothing", async () => {
  const { d, calls } = deps();
  assert.equal((await handleCareers(req(app({ role: "" })), d)).status, 400);
  assert.equal(calls.length, 0);
});
test("careers: honeypot and fast posts are dropped", async () => {
  for (const o of [{ hp_extra: "x" }, { elapsed_ms: 300 }]) {
    const { d, calls } = deps();
    assert.equal((await handleCareers(req(app(o)), d)).json.ok, true);
    assert.equal(calls.length, 0);
  }
});
test("careers: a GHL failure still answers ok and logs the application", async () => {
  const { d, logs } = deps({}, () => new Response("", { status: 500 }));
  const r = await handleCareers(req(app()), d);
  assert.equal(r.json.delivered, undefined);
  assert.ok(logs.some((l) => l.includes("DELIVERY FAILED") && l.includes("s@example.com")));
});
