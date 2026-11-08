// Browser QA against a running server (`npm run build && npm start`): every route at five widths, redirects in one hop,
// and one real booking per studio through /api/lead. Pass BASE and MOCKUP to override the hosts.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3030";
const MOCKUP = process.env.MOCKUP ?? "http://localhost:3029";
const pages = JSON.parse(readFileSync(new URL("../src/content/generated/pages.json", import.meta.url), "utf8"));
const routes = Object.keys(pages).filter((r) => r !== "/404");
const STEM = { "/": "index", "/programs/small-group-personal-training": "small-group", "/programs/private-personal-training": "private-training", "/locations/roundrock": "round-rock", "/locations/shoal-creek": "shoal-creek", "/locations/steiner-ranch": "steiner-ranch", "/success-stories/jennifer": "story-jennifer", "/success-stories/cindy": "story-cindy", "/success-stories/lauren": "story-lauren" };
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
let bad = 0;
const fail = (...a) => { bad++; console.log("FAIL", ...a); };

for (const width of [1440, 1024, 768, 390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  for (const r of routes) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/youtube|ytimg|tile\.openstreetmap|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    const res = await p.goto(BASE + r, { waitUntil: "load" });
    await p.waitForTimeout(150);
    const q = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll("h1").length, broken: [...document.images].filter((i) => i.complete && !i.naturalWidth && !/ytimg|openstreetmap/.test(i.src) && i.loading !== "lazy").length }));
    if (res.status() !== 200 || errs.length || q.over > 0 || q.h1 !== 1 || q.broken) fail(r, width, res.status(), q, errs.slice(0, 2));
    await p.close();
  }
  await ctx.close();
}
console.log("routes checked", routes.length, "at 5 widths");

// text parity with the approved mockup
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const text = async (u) => { const p = await ctx.newPage(); await p.goto(u, { waitUntil: "load" }); const t = await p.locator("main").innerText(); const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.close(); return { t: t.replace(/\s+/g, " ").trim(), h }; };
  for (const r of routes) {
    const stem = STEM[r] ?? r.slice(1);
    const [a, b] = [await text(BASE + r), await text(`${MOCKUP}/${stem}.html`)];
    if (a.t !== b.t) fail("text differs from mockup", r);
    if (Math.abs(a.h - b.h) > 4) fail("height differs from mockup", r, a.h, b.h);
  }
  await ctx.close();
  console.log("mockup parity checked");
}

// redirects: one hop, both slash forms
for (const [from, to] of [["/fitness-services-in/small-group-personal-training-in-austin-tx/", "/programs/small-group-personal-training"], ["/location/round-rock", "/locations/roundrock"], ["/locations/shoal-creek/", "/locations/shoal-creek"], ["/talk-with-us/", "/book"], ["/apply", "/careers"], ["/about/", "/about"]]) {
  const r = await fetch(BASE + from, { redirect: "manual" });
  if (![301, 308].includes(r.status) || new URL(r.headers.get("location"), BASE).pathname !== to) fail("redirect", from, r.status, r.headers.get("location"));
}
if ((await fetch(`${BASE}/client-form/`, { redirect: "manual" })).status !== 404 && (await fetch(`${BASE}/client-form`)).status !== 404) fail("/client-form is not 404");
if ((await fetch(`${BASE}/client-form`)).status !== 404) fail("/client-form is not 404");

// a real booking per studio, and a pricing request
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  for (const [key, path] of [["shoal_creek", "/locations/shoal-creek"], ["steiner_ranch", "/locations/steiner-ranch"], ["round_rock", "/locations/roundrock"]]) {
    const p = await ctx.newPage();
    await p.goto(BASE + path, { waitUntil: "load" });
    const f = p.locator("form[data-form-id=st]");
    if ((await f.locator("select").inputValue()) !== key) fail("form not locked", key);
    await f.locator("[name=first_name]").fill("QA");
    await f.locator("[name=email]").fill("qa@example.com");
    await f.locator("[name=phone]").fill("5125550100");
    await p.waitForTimeout(1600);
    const [req] = await Promise.all([p.waitForRequest("**/api/lead"), f.locator("button[type=submit]").click()]);
    if (req.postDataJSON().studio !== key) fail("lead posted the wrong studio", key);
    await p.locator("form[data-form-id=st] ~ [data-form-success]").waitFor({ state: "visible" });
    await p.close();
  }
  {
    const q = await ctx.newPage();
    await q.goto(`${BASE}/locations/steiner-ranch`, { waitUntil: "load" });
    await q.locator(".hdr-cta-desk [data-book]").click();
    const opts = await q.locator("[data-book-modal] select option").allInnerTexts();
    if (opts.join() !== "Steiner Ranch") fail("header Book not locked on a studio page", opts);
    await q.goto(`${BASE}/book?studio=round_rock`, { waitUntil: "load" });
    const o2 = await q.locator("form[data-form-id=bk] select option").allInnerTexts();
    if (o2.join() !== "Round Rock") fail("/book?studio not applied", o2);
    await q.setViewportSize({ width: 390, height: 844 });
    await q.locator("[data-menu-toggle]").click();
    if (!(await q.evaluate(() => document.querySelector("main").inert))) fail("page behind the phone menu is not inert");
    await q.close();
  }
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "load" });
  await p.locator(".nav-desk a[data-pricing]").click();
  const f = p.locator("[data-pricing-modal] form");
  await f.locator("select").selectOption("round_rock");
  await f.locator("[name=first_name]").fill("QA");
  await f.locator("[name=email]").fill("qa@example.com");
  await f.locator("[name=phone]").fill("5125550100");
  await p.waitForTimeout(1600);
  const [req] = await Promise.all([p.waitForRequest("**/api/lead"), f.locator("button[type=submit]").click()]);
  const b = req.postDataJSON();
  if (b.interest !== "pricing" || b.studio !== "round_rock") fail("pricing post", b);
  await p.locator("[data-pricing-modal] [data-form-success]").waitFor({ state: "visible" });
  await ctx.close();
  console.log("leads checked");
}
await browser.close();
console.log(bad ? `${bad} FAILED` : "QA PASSED");
process.exit(bad ? 1 : 0);
