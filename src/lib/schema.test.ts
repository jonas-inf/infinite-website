import assert from "node:assert/strict";
import { test } from "node:test";
import { schemas, studioSchema } from "./schema.ts";
import pages from "../content/generated/pages.json" with { type: "json" };

const PAGES = pages as Record<string, { body: string }>;

test("each studio's schema carries its own address, phone and geo", () => {
  const sc = studioSchema("/locations/shoal-creek")!, rr = studioSchema("/locations/roundrock")!;
  assert.equal(sc.telephone, "(512) 861-8319");
  assert.equal(sc.address.postalCode, "78757");
  assert.equal(rr.address.addressLocality, "Round Rock");
  assert.equal(rr.telephone, "(512) 931-3538");
  assert.equal(rr.geo.latitude, 30.4938136);
});
test("other routes have none", () => assert.equal(studioSchema("/about"), null));
test("studio hours match the page and skip closed days", () => {
  const h = studioSchema("/locations/shoal-creek")!.openingHoursSpecification;
  assert.deepEqual(h[0], { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "05:30", closes: "19:30" });
  assert.equal(h.length, 6);
  assert.ok(!h.some((d) => d.dayOfWeek === "Sunday"));
  assert.deepEqual(studioSchema("/locations/steiner-ranch")!.sameAs, ["https://www.google.com/maps?cid=4210421116158205883"]);
});
test("home carries the business, /faq carries every visible question word for word", () => {
  const home = schemas("/", PAGES["/"].body);
  assert.equal(home.length, 1);
  const faq = schemas("/faq", PAGES["/faq"].body)[0] as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
  const rows = PAGES["/faq"].body.match(/class="faq-row"/g)!.length;
  assert.equal(faq.mainEntity.length, rows);
  assert.equal(faq.mainEntity[0].name, "What is small-group personal training?");
  assert.ok(faq.mainEntity.every((q) => q.name && q.acceptedAnswer.text.length > 20 && !/[<>]/.test(q.acceptedAnswer.text)));
  assert.deepEqual(schemas("/about", PAGES["/about"].body), []);
});
