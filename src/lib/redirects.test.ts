import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY, redirects } from "./redirects.ts";
import pages from "../content/generated/pages.json" with { type: "json" };

test("every destination is a real page in one hop", () => {
  const froms = new Set(LEGACY.map(([f]) => f));
  for (const [, to] of LEGACY) {
    assert.ok(to === "/sitemap.xml" || to in pages, to);
    assert.ok(!froms.has(to), `${to} redirects again`);
  }
});
test("both slash forms of a legacy URL are covered", () => {
  const sources = new Set(redirects().map((r) => r.source));
  for (const [f] of LEGACY) assert.ok(sources.has(f) && sources.has(`${f}/`), f);
});
test("the Google-linked studio URLs resolve to their own studio", () => {
  const map = new Map(LEGACY);
  assert.equal(map.get("/location/shoal-creek"), "/locations/shoal-creek");
  assert.equal(map.get("/location/round-rock"), "/locations/roundrock");
});
test("/client-form has no redirect", () => {
  assert.ok(!redirects().some((r) => r.source.startsWith("/client-form")));
});
test("the slash rule comes last", () => {
  assert.equal(redirects().at(-1)?.source, "/:path+/");
});
