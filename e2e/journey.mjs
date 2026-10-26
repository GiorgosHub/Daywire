// End-to-end checks of the main journeys against the local server in fixture mode, plus a failing-API server.
// Run: npm run build && node e2e/journey.mjs   (starts its own servers on 4190/4191)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/home/claude/mirror/package.json")("playwright")); }

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["ok", name]); }
  catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

function serve(port, env) {
  const p = spawn(process.execPath, ["--import", "tsx", "server/dev.mjs"], { env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((res) => p.stdout.on("data", (d) => { if (String(d).includes("DAYWIRE on")) res(p); }));
}

const ok = await serve(4190, { DAYWIRE_FIXTURES: "1", TFL_APP_KEY: "fixture" });
const bad = await serve(4191, { FAIL_FEED: "1" });
const BASE = "http://localhost:4190/";
const browser = await chromium.launch();
const errors = [];
const watch = (p) => { p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("pageerror", (e) => errors.push(e.message)); };
const ready = (p) => p.waitForFunction(() => !document.querySelector(".skeleton") && !document.querySelector(".wire-loading"), null, { timeout: 15000 });

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "el-GR", timezoneId: "Europe/Athens" });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE, { waitUntil: "load" });

  await check("first visit: a location chooser, no feed and no GPS prompt", async () => {
    assert((await page.textContent("h1")).includes("Η μέρα σου, με μια ματιά."), "h1");
    assert(await page.isVisible(".chooser"), "chooser");
    assert(!(await page.isVisible(".card")), "no cards before a location is chosen");
  });
  await check("worldwide location search finds Larissa and opens it", async () => {
    await page.click(".chooser .btn");
    await page.fill("#loc-q", "Larissa");
    await page.waitForSelector("#loc-results .loc-opt");
    const first = await page.textContent("#loc-results .loc-opt");
    assert((first.includes("Θεσσαλία") || first.includes("Thessaly")) && first.includes("Καλή κάλυψη"), first);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#s-priority .card", { timeout: 15000 });
  });
  await check("an unsaved location says so and can be followed", async () => {
    assert(await page.isVisible(".banner.info"), "not-saved banner");
    await page.click(".banner.info .btn");
    assert(!(await page.isVisible(".banner.info")), "banner gone after following");
  });
  await check("Larissa: two official orange warnings first, coverage reported as good", async () => {
    const cards = page.locator("#s-priority .card");
    assert((await cards.count()) === 2, `priority cards ${await cards.count()}`);
    assert((await cards.first().textContent()).includes("Πορτοκαλί Προειδοποίηση"), "issuer's own words");
    assert((await page.textContent(".coverage")).includes("Καλή κάλυψη"), "coverage");
    assert(await page.isVisible(".banner.fixture"), "test-data banner");
  });
  await check("published and checked times are shown separately on a card", async () => {
    const meta = await page.locator("#s-upcoming .card .meta").first().textContent();
    assert(meta.includes("Δημοσίευση") && meta.includes("Ελέγχθηκε"), meta);
  });
  await check("search is accent-insensitive (φαλανη → Φαλάνη); no match is not an error", async () => {
    await page.fill("#q", "φαλανη");
    await page.waitForSelector("#s-results .card");
    assert((await page.locator("#s-results .card").first().textContent()).includes("Φαλάνη"), "hit");
    await page.fill("#q", "ζζζζ");
    await page.waitForSelector(".state.empty");
    assert((await page.textContent(".state.empty")).includes("Τίποτα"), "empty text");
    await page.click("text=Καθαρισμός φίλτρων");
  });
  await check("category filter returns only that category", async () => {
    await page.click(".filters .chip-btn:has-text('Νερό')");
    const cats = await page.locator("#s-results .card .cat").allTextContents();
    assert(cats.length > 0 && cats.every((c) => c.includes("Νερό")), cats.join("|"));
    await page.click("text=Καθαρισμός φίλτρων");
  });
  await check("detail: original link, both timestamps, provenance, Escape closes", async () => {
    await page.goto(BASE + "#/n/" + encodeURIComponent("deyal-water:3727"));
    await page.waitForSelector("#dlg-detail[open]");
    const href = await page.getAttribute("#dlg-detail .d-actions a.btn", "href");
    assert(href === "https://deyal.gr/el/gia-polites/vlaves-diakopes/item/3727-diakopi-nerou", href);
    const tl = await page.textContent("#dlg-detail .timeline");
    assert(tl.includes("Δημοσιεύτηκε") && tl.includes("Τελευταία επαλήθευση") && tl.includes("έτος από την ημερομηνία δημοσίευσης"), tl);
    assert((await page.locator("#dlg-detail .d-sources li").count()) === 2, "two sources");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-detail", { state: "detached" });
  });
  await check("neighbourhoods for a saved location persist after reload", async () => {
    await page.click(".ov-scope .link");
    await page.waitForSelector("#dlg-places[open]");
    await page.click("#dlg-places label.place:has-text('Γιάννουλη')");
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "load" }); await ready(page);
    assert((await page.textContent(".ov-for")).includes("Γιάννουλη"), "persisted");
  });
  await check("London: second saved location, its own coverage, time zone and transport", async () => {
    await page.click(".place-btn");
    await page.fill("#loc-q", "London");
    await page.waitForSelector("#loc-results .loc-opt");
    await page.click("#loc-results .loc-opt >> nth=0");
    await page.waitForSelector(".coverage", { timeout: 15000 });
    assert((await page.textContent(".coverage")).includes("Μερική κάλυψη"), "partial");
    assert((await page.locator(".card.cat-transport").count()) === 3, "three TfL lines with problems");
    assert((await page.textContent(".wire-now")).includes("GMT"), "London's zone is named for a viewer in Athens");
    await page.click(".banner.info .btn");
    await page.reload({ waitUntil: "load" }); await ready(page);
    const chips = await page.locator(".loc-chip").allTextContents();
    assert(chips.length === 2 && chips.some((c) => c.includes("Λάρισα")), chips.join("|"));
    await page.click(".loc-chip:has-text('Λάρισα')");
    await page.waitForSelector("#s-priority .card", { timeout: 15000 });
  });
  await check("a place with no sources says so, and never claims nothing is happening", async () => {
    await page.goto(BASE + "#/at/gn:1850147", { waitUntil: "load" });
    await page.waitForSelector(".nocov", { timeout: 15000 });
    const txt = await page.textContent("main");
    assert(txt.includes("δεν έχει ακόμα συνδεδεμένες πηγές") && txt.includes("δεν μπορεί να σου πει αν συμβαίνει κάτι"), "honest no-coverage text");
    assert(!txt.includes("Καμία ενεργή"), "no calm claim");
    assert(!(await page.isVisible(".card")), "no cards");
  });
  await check("English interface; official titles stay in their language", async () => {
    await page.goto(BASE, { waitUntil: "load" }); await ready(page);
    await page.click("button[aria-label='Προτιμήσεις']");
    await page.click("#dlg-prefs button:has-text('English')");
    await page.keyboard.press("Escape");
    assert((await page.textContent("h1")).includes("Your day, at a glance."), "en h1");
    assert((await page.textContent("#s-upcoming .card-title")).includes("λαϊκές αγορές"), "greek title kept");
    await page.click("button[aria-label='Preferences']");
    await page.click("#dlg-prefs button:has-text('Ελληνικά')");
    await page.keyboard.press("Escape");
  });
  await check("sources page: this location's health and the worldwide registry", async () => {
    await page.goto(BASE + "#/sources", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".src-table").length === 2 && document.querySelectorAll(".src-table")[1].querySelectorAll("tbody tr").length >= 8, null, { timeout: 15000 });
    const reg = await page.locator(".src-table").nth(1).textContent();
    assert(reg.includes("United States") || reg.includes("ΗΠΑ"), "US listed");
    assert(reg.includes("Χρειάζεται κλειδί") || reg.includes("Συνδεδεμένη"), "states shown");
  });
  await check("no browser console errors", async () => { assert(errors.length === 0, errors.join(" | ")); });
  await ctx.close();

  await check("first-release preferences (Larissa only) are migrated", async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript(() => { if (!localStorage.getItem("daywire:prefs:v2")) localStorage.setItem("daywire:prefs:v1", JSON.stringify({ cityId: "larisa", placeIds: ["falani"], terms: ["Φαρσάλων"], categories: [], saved: ["deyal-water:3727"], lang: "el" })); });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: "load" }); await ready(p);
    const scope = await p.textContent(".ov-for");
    assert(scope.includes("Λάρισα") && scope.includes("Φαλάνη") && scope.includes("Φαρσάλων"), scope);
    assert((await p.textContent(".filters")).includes("Αποθηκευμένα (1)"), "saved item kept");
    await c.close();
  });
  await check("390px: no horizontal scroll; header and location dialog usable", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await p.goto(BASE + "#/at/gn:258576", { waitUntil: "load" }); await ready(p);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(over <= 0, `overflow ${over}`);
    const box = await p.locator("button[aria-label='Προτιμήσεις']").boundingBox();
    assert(box && box.x + box.width <= 390, "prefs button inside viewport");
    await p.click(".place-btn");
    await p.waitForSelector("#dlg-locations[open]");
    const over2 = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(over2 <= 0, `overflow with dialog ${over2}`);
    await c.close();
  });
  await check("reduced motion and no web fonts: still renders all sections", async () => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.route("**/fonts/**", (r) => r.abort());
    await p.goto(BASE + "#/at/gn:258576", { waitUntil: "load" }); await ready(p);
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".fresh-dot")).animationName);
    assert(anim === "none", `animation ${anim}`);
    assert(await p.isVisible("#s-priority"), "sections");
    await c.close();
  });
  await check("API failure is shown as a failure, never as 'nothing happening'", async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto("http://localhost:4191/#/at/gn:258576", { waitUntil: "load" });
    await p.waitForSelector(".state.error", { timeout: 15000 });
    const txt = await p.textContent("main");
    assert(txt.includes("Δεν μπορέσαμε να φέρουμε τα δεδομένα"), "error state");
    assert(!txt.includes("Καμία ενεργή"), "must not claim calm");
    await c.close();
  });
} finally {
  await browser.close();
  ok.kill(); bad.kill();
}

for (const r of results) console.log(r[0].padEnd(4), r[1], r[2] ? `→ ${r[2]}` : "");
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
