import assert from "node:assert/strict";
import { test } from "node:test";
import { studioSchema } from "./schema.ts";

test("each studio's schema carries its own address, phone and geo", () => {
  const sc = studioSchema("/locations/shoal-creek")!, rr = studioSchema("/locations/roundrock")!;
  assert.equal(sc.telephone, "(512) 861-8319");
  assert.equal(sc.address.postalCode, "78757");
  assert.equal(rr.address.addressLocality, "Round Rock");
  assert.equal(rr.telephone, "(512) 931-3538");
  assert.equal(rr.geo.latitude, 30.4938136);
});
test("other routes have none", () => assert.equal(studioSchema("/about"), null));
