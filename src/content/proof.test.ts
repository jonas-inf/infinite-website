import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import pages from "./generated/pages.json" with { type: "json" };

const P = pages as Record<string, { title: string; description: string; body: string }>;
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// The Google capture lives in the build workspace only, not in the client's repo (D-069)
const files = ["shoalcreek", "steinerranch", "roundrock"].map((f) => new URL(`../../../sources/google-2026-10-10/${f}.json`, import.meta.url));
const hasCapture = files.every((u) => existsSync(u));
const capture = hasCapture ? files.flatMap((u) => (JSON.parse(readFileSync(u, "utf8")).reviews as { author: string; text?: string }[])) : [];
const cards = (body: string) => [...body.matchAll(/data-author="([^"]+)"[\s\S]*?(?:data-review-text>|rband-quote">“)([\s\S]*?)<\/p>/g)].map((m) => ({ author: unescape(m[1]), text: unescape(m[2]) }));

test("every review card is word for word from the Google capture", { skip: !hasCapture && "no Google capture here" }, () => {
  let n = 0;
  for (const [route, p] of Object.entries(P)) for (const c of cards(p.body)) {
    n++;
    const t = c.text.replace(/”$/, "");
    assert.ok(capture.some((r) => r.author === c.author && (r.text ?? "").includes(t)), `${route}: ${c.author}`);
  }
  assert.ok(n > 60, `only ${n} cards seen`);
});
test("no review on more than 3 pages or twice on a page", () => {
  const pagesWith = new Map<string, number>();
  for (const [route, p] of Object.entries(P)) {
    const keys = cards(p.body).map((c) => `${c.author}|${c.text.replace(/”$/, "").slice(0, 40)}`);
    assert.equal(new Set(keys).size, keys.length, `${route} repeats a review`);
    for (const k of keys) pagesWith.set(k, (pagesWith.get(k) ?? 0) + 1);
  }
  for (const [k, n] of pagesWith) assert.ok(n <= 3, `${k} on ${n} pages`);
});
test("off-roster names, held wording and blocked videos never render", () => {
  const blocked = ["1nKMIeQpy2M", "TJX5ZOBGs4w", "6oQIyUV7rnQ", "XjPjDzAIuxc", "rHC1PciRc7E", "Kvg9ARJfIDs", "xhxC4pxiMmE", "b1dShXDRWUU", "XSRjasR4To8", "k5oAJW7NRhQ", "S6x0yztqQu0"];
  for (const [route, p] of Object.entries(P)) {
    for (const bad of [/prasam/i, /Get To Know You/, /VIP Trial/, /OrangeTheory/, /sms_consent/, /type="checkbox"/, ...blocked.map((b) => new RegExp(b))]) assert.ok(!bad.test(p.body), `${route}: ${bad}`);
  }
});
test("one H1 per page, footer SMS notice on every page", () => {
  for (const [route, p] of Object.entries(P)) {
    assert.equal((p.body.match(/<h1[\s>]/g) ?? []).length, 1, route);
    assert.ok(p.body.includes('class="fsms"'), route);
  }
});
test("every internal link resolves", () => {
  for (const [route, p] of Object.entries(P)) for (const m of p.body.matchAll(/href="(\/[^"#?]*)/g)) {
    const h = m[1];
    if (h.startsWith("//")) continue;
    assert.ok(h in P || h.startsWith("/img/"), `${route} → ${h}`);
  }
});
