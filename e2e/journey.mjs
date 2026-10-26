// End-to-end checks of the main journey against the local server in fixture mode, plus a failing-API server.
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

const ok = await serve(4190, { DAYWIRE_FIXTURES: "1" });
const bad = await serve(4191, { FAIL_FEED: "1" });
const BASE = "http://localhost:4190/";
const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "el-GR", timezoneId: "Europe/Athens" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  await check("homepage renders the Greek heading and the test-data banner", async () => {
    assert((await page.textContent("h1")).includes("Η μέρα σου, με μια ματιά."), "h1");
    assert(await page.isVisible(".banner.fixture"), "fixture banner");
  });
  await check("priority shows the two official orange warnings, with source-set severity", async () => {
    const cards = page.locator("#s-priority .card");
    assert((await cards.count()) === 2, `priority cards ${await cards.count()}`);
    assert((await cards.first().textContent()).includes("Πορτοκαλί προειδοποίηση"), "severity text");
  });
  await check("published and checked times are shown separately on a card", async () => {
    const meta = await page.locator("#s-upcoming .card .meta").first().textContent();
    assert(meta.includes("Δημοσίευση") && meta.includes("Ελέγχθηκε"), meta);
  });
  await check("today's wire draws only records and links to them", async () => {
    const n = await page.locator(".wire-row").count();
    assert(n >= 3, `wire rows ${n}`);
    assert((await page.locator(".wire-row a").first().getAttribute("href")).startsWith("#/n/"), "link");
  });
  await check("search is accent-insensitive (φαλανη → Φαλάνη)", async () => {
    await page.fill("#q", "φαλανη");
    await page.waitForSelector("#s-results");
    const txt = await page.locator("#s-results .card").first().textContent();
    assert(txt.includes("Φαλάνη"), txt);
    await page.fill("#q", "");
    await page.waitForTimeout(300);
  });
  await check("search with no match says so and does not look like an error", async () => {
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
  await check("detail view: original link, both timestamps, Escape closes", async () => {
    await page.goto(BASE + "#/n/" + encodeURIComponent("deyal-water:3727"));
    await page.waitForSelector("#dlg-detail[open]");
    const href = await page.getAttribute("#dlg-detail .d-actions a.btn", "href");
    assert(href === "https://deyal.gr/el/gia-polites/vlaves-diakopes/item/3727-diakopi-nerou", href);
    const tl = await page.textContent("#dlg-detail .timeline");
    assert(tl.includes("Δημοσιεύτηκε") && tl.includes("Τελευταία επαλήθευση"), tl);
    assert(tl.includes("έτος από την ημερομηνία δημοσίευσης"), "year provenance");
    const srcs = await page.locator("#dlg-detail .d-sources li").count();
    assert(srcs === 2, `sources ${srcs}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-detail", { state: "detached" });
  });
  await check("choose a place, see it in the overview, survive a reload", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click(".place-btn");
    await page.waitForSelector("#dlg-places[open]");
    await page.click("#dlg-places label.place:has-text('Γιάννουλη')");
    await page.keyboard.press("Escape");
    assert((await page.textContent(".ov-for")).includes("Γιάννουλη"), "overview scope");
    await page.reload({ waitUntil: "networkidle" });
    assert((await page.textContent(".ov-for")).includes("Γιάννουλη"), "persisted");
    assert((await page.textContent(".place-btn")).includes("+1"), "badge");
  });
  await check("save an item; saved filter finds it after reload", async () => {
    await page.locator("#s-upcoming .card .save").first().click();
    await page.reload({ waitUntil: "networkidle" });
    await page.click(".filters .chip-btn:has-text('Αποθηκευμένα')");
    assert((await page.locator("#s-results .card").count()) === 1, "one saved");
    await page.click("text=Καθαρισμός φίλτρων");
  });
  await check("English interface; official Greek titles stay Greek", async () => {
    await page.click("button[aria-label='Προτιμήσεις']");
    await page.click("#dlg-prefs button:has-text('English')");
    await page.keyboard.press("Escape");
    assert((await page.textContent("h1")).includes("Your day, at a glance."), "en h1");
    assert((await page.textContent("#s-upcoming .card-title")).includes("λαϊκές αγορές"), "greek title kept");
    await page.click("button[aria-label='Preferences']");
    await page.click("#dlg-prefs button:has-text('Ελληνικά')");
    await page.keyboard.press("Escape");
  });
  await check("sources page lists every source with its method and state", async () => {
    await page.goto(BASE + "#/sources", { waitUntil: "networkidle" });
    const rows = await page.locator(".src-table tbody tr").count();
    assert(rows === 5, `rows ${rows}`);
    assert((await page.textContent(".src-table")).includes("Μόνο σύνδεσμος"), "link-only shown");
  });
  await check("no browser console errors", async () => { assert(errors.length === 0, errors.join(" | ")); });
  await ctx.close();

  await check("390px: no horizontal scroll, header actions visible, cards readable", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "el-GR", timezoneId: "Europe/Athens", isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: "networkidle" });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(over <= 0, `overflow ${over}`);
    const box = await p.locator("button[aria-label='Προτιμήσεις']").boundingBox();
    assert(box && box.x + box.width <= 390, "prefs button inside viewport");
    await p.click(".place-btn");
    await p.waitForSelector("#dlg-places[open]");
    await c.close();
  });
  await check("reduced motion and no fonts loaded: still renders all sections", async () => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.route("**/fonts/**", (r) => r.abort());
    await p.goto(BASE, { waitUntil: "networkidle" });
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".fresh-dot")).animationName);
    assert(anim === "none", `animation ${anim}`);
    assert(await p.isVisible("#s-priority"), "sections");
    await c.close();
  });
  await check("API failure is shown as a failure, never as 'nothing happening'", async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto("http://localhost:4191/", { waitUntil: "networkidle" });
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
