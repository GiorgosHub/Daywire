// DAYWIRE client: pick a location, load its feed, render the current route, keep statuses current.
// Routes: #/ (home), #/n/<notice id> (detail), #/sources, #/at/gn:<GeoNames id> (open a location by link).
// The shell (the city field behind the hero, the compact bar) is built once; regions inside it re-render.
// Scroll: the city holds still while the page, a paper sheet, slides over it (teleia's pinned scenes); the compact
// bar takes over once it is covered and hides while you scroll down (Giannotas' header).
import { FEATURED } from "./domain/localities.ts";
import type { Feed, GeoLocation } from "./domain/types.ts";
import { rows } from "./domain/view.ts";
import { clear, h, icon } from "./app/dom.ts";
import { reducedMotion } from "./app/fx/loop.ts";
import { FlapText } from "./app/fx/flap.ts";
import { installGlide } from "./app/fx/glide.ts";
import { installPointerFx } from "./app/fx/motion.ts";
import { getLang, M, setLang, tx } from "./app/i18n/index.ts";
import { lastFeed, rememberFeed, save } from "./app/prefs.ts";
import { failedSources, now, onRender, onSwitch, prefsHere, S, savedEntry } from "./app/state.ts";
import { openDetail } from "./app/views/detail.ts";
import { openLocations, openPrefs } from "./app/views/dialogs.ts";
import { feedField, fieldApi, hero, liveClock, mountStage, startClocks } from "./app/views/hero.ts";
import { banners, feedBody } from "./app/views/home.ts";
import { railFor, railMeasure, railReset, railUpdate, type RailLayout } from "./app/views/rail.ts";
import { sourcesPage } from "./app/views/sources.ts";

const app = document.getElementById("app")!;

// ——— persistent shell ———
const stage = h("div", { class: "stage", "aria-hidden": "true" }, h("div", { class: "stage-css" }));
const bar = h("div", { class: "wrap top-in" });
const heroSlot = h("div", { class: "hero-slot" });
const top = h("header", { class: "top" }, bar, heroSlot);
const veil = h("div", { class: "veil", "aria-hidden": "true" });
const shell = h("div", { class: "shell" }, stage, top, veil);
const mainEl = h("main", { id: "main", class: "wrap main", tabindex: "-1" });
const footSlot = h("div");
const tickSlot = h("div", { class: "tick-slot" });
const sheet = h("div", { class: "sheet" }, tickSlot, mainEl);
const compact = h("div", { class: "compact", "aria-hidden": "true" });
const railSlot = h("div", { class: "rail-slot" });
let rail: HTMLElement | null = null;

function brand(): HTMLElement {
  return h("a", { class: "brand", href: "#/", "aria-label": "DAYWIRE" }, h("span", { class: "b-day" }, "DAY"),
    h("span", { class: "b-pulse", "aria-hidden": "true" }, svgPulse()), h("span", { class: "b-wire" }, "WIRE"));
}
function svgPulse(): Element {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 28 14");
  s.innerHTML = '<path d="M0 8 H8 L11 8 L13.5 2 L16.5 13 L19 6 L21 8 H28"/>';
  return s;
}

function barContent(): Node[] {
  const m = M();
  const cur = S.current;
  const n = cur ? (savedEntry()?.placeIds.length ?? 0) + (savedEntry()?.terms.length ?? 0) : 0;
  return [
    brand(),
    h("nav", { class: "top-actions", "aria-label": m.mainNav },
      h("button", { type: "button", class: "place-btn", onclick: () => openLocations(), "aria-label": cur ? m.locationButton(tx(cur.name), tx(cur.country)) : m.chooseLocation },
        icon("pin", "ic ic-s"), h("span", { class: "pb-name" }, cur ? tx(cur.name) : m.chooseLocation), cur ? h("span", { class: "pb-cc" }, cur.countryCode) : null, n ? h("span", { class: "badge" }, `+${n}`) : null),
      h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.searchNotices, title: m.searchNotices, disabled: !S.feed, onclick: () => focusSearch() }, icon("search")),
      h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.savedCount(S.prefs.savedNotices.length), title: m.saved, onclick: () => { S.filters = { ...S.filters, savedOnly: true }; location.hash = "#/"; render(); document.getElementById("s-results")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); } },
        icon("bookmark"), S.prefs.savedNotices.length ? h("span", { class: "dot-count" }, String(S.prefs.savedNotices.length)) : null),
      h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.preferences, title: m.preferences, onclick: () => openPrefs() }, icon("sliders")),
    ),
  ];
}

function focusSearch(): void {
  location.hash = "#/";
  setTimeout(() => { const q = document.getElementById("q"); q?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); q?.focus({ preventScroll: true }); }, 0);
}

function compactContent(): Node[] {
  const cur = S.current;
  return [h("div", { class: "wrap compact-in" },
    brand(),
    cur ? h("button", { type: "button", class: "cp-place", tabindex: "-1", onclick: () => openLocations() }, icon("pin", "ic ic-s"), tx(cur.name), liveClock(cur.tz)) : null,
    h("button", { type: "button", class: "btn-icon on-dark", tabindex: "-1", "aria-label": M().searchNotices, onclick: () => focusSearch() }, icon("search")),
  )];
}

function footer(): HTMLElement {
  const m = M();
  const f = S.feed;
  const items = f ? f.sources.map((s) => `${tx(s.name)} — ${m.srcState[s.state]}`) : [];
  const track = items.length ? h("div", { class: "marquee", "aria-hidden": "true" }, h("div", { class: "marquee-track" }, ...[...items, ...items, ...items, ...items].map((t) => h("span", {}, t)))) : null;
  const mark = new FlapText(7, "c-mark");
  mark.set("DAYWIRE", { animate: false });
  const shuffle = () => { mark.scramble(true); setTimeout(() => mark.set("DAYWIRE", { stagger: 60 }), 380); };
  return h("footer", { class: "foot" }, track,
    h("div", { class: "wrap foot-mark", onpointerenter: shuffle }, mark.el),
    h("div", { class: "wrap foot-in" },
      h("div", { class: "foot-brand" }, brand(), h("p", { class: "muted" }, m.heroSub)),
      h("p", { class: "f-112" }, icon("emergency", "ic ic-s"), h("span", {}, h("strong", {}, `${m.footEmergencyTitle} `), m.footEmergency)),
      h("p", { class: "muted" }, m.footIndependent, " ", h("a", { href: "#/sources" }, m.sourcesTitle)),
    ));
}

function keepFocus<T>(fn: () => T): T {
  const a = document.activeElement as HTMLInputElement | null;
  const id = a?.id, sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : undefined;
  const out = fn();
  if (id) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && el !== a) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange && sel[0] !== null) try { el.setSelectionRange(sel[0]!, sel[1]!); } catch { /* not a text field */ } }
  }
  return out;
}

const keys = { bar: "", compact: "", foot: "" };
function render(): void {
  keepFocus(() => {
    const route = location.hash.replace(/^#/, "") || "/";
    const t0 = now();
    const all = S.feed && S.feed.location.id === S.current?.id ? rows(S.feed.notices, prefsHere(), t0, failedSources()) : [];
    // only what changed is rebuilt: the bar, the compact bar and the footer have keys; the hero updates in place
    const entry = savedEntry();
    const bk = JSON.stringify([S.current?.id, getLang(), S.prefs.savedNotices.length, entry?.placeIds.length, entry?.terms.length, Boolean(S.feed)]);
    if (bk !== keys.bar) { keys.bar = bk; clear(bar); bar.append(...barContent()); }
    const heroEl = hero(all, t0);
    if (heroSlot.firstChild !== heroEl) heroSlot.replaceChildren(heroEl);
    const ck = JSON.stringify([S.current?.id, getLang()]);
    if (ck !== keys.compact) { keys.compact = ck; clear(compact); compact.append(...compactContent()); }
    clear(mainEl);
    mainEl.append(...banners());
    const onSources = route.startsWith("/sources");
    if (onSources) mainEl.append(sourcesPage());
    else mainEl.append(feedBody(all, t0));
    clear(railSlot); rail = onSources ? null : railFor(mainEl); if (rail) railSlot.append(rail); railReset();
    const fk = JSON.stringify([getLang(), S.feed?.location.id, S.feed?.sources.map((x) => x.state)]);
    if (fk !== keys.foot) { keys.foot = fk; clear(footSlot); footSlot.append(footer()); }
    feedField(S.feed, all, t0);
    measure();
    document.title = route.startsWith("/sources") ? `${M().sourcesTitle} · DAYWIRE` : S.current ? `${tx(S.current.name)} · DAYWIRE` : "DAYWIRE";
  });
}

async function loadFeed(loc: GeoLocation): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`/api/feed?loc=${encodeURIComponent(loc.id)}`, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const f = (await r.json()) as Feed;
    if (f.version !== 2 || !Array.isArray(f.notices) || !Array.isArray(f.sources) || f.location?.id !== loc.id) throw new Error("unexpected response");
    if (S.current?.id !== loc.id) return; // the person switched meanwhile
    S.feed = f; S.feedState = "ok";
    if (f.mode === "live") rememberFeed(f);
  } catch (e) {
    if (S.current?.id !== loc.id) return;
    const cached = lastFeed(loc.id);
    S.error = e instanceof Error ? e.message : String(e);
    if (cached) { S.feed = cached; S.feedState = "cached"; } else { S.feed = undefined; S.feedState = "error"; }
  } finally { clearTimeout(timer); }
}

async function switchLocation(loc: GeoLocation, animate = true): Promise<void> {
  // state changes now (a View Transition runs its update later, after the feed request may have started)
  S.current = loc;
  S.feed = undefined;
  S.feedState = "loading";
  S.filters = { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false };
  if (savedEntry(loc.id)) { S.prefs = { ...S.prefs, activeId: loc.id }; save(S.prefs); }
  if (location.hash.startsWith("#/at/") || location.hash.startsWith("#/n/")) history.replaceState(null, "", "#/");
  // the board flips to the new place (and the city morphs into its own streets); no page-wide wipe needed
  void animate;
  render();
  await loadFeed(loc);
  route();
}

function route(): void {
  const m = /^#\/n\/(.+)$/.exec(location.hash);
  if (m && S.feed) {
    const id = decodeURIComponent(m[1]!);
    const r = rows(S.feed.notices, prefsHere(), now(), failedSources()).find((x) => x.n.id === id);
    if (r) { if (!document.getElementById("dlg-detail")) { render(); openDetail(r, now()); } return; }
  }
  document.getElementById("dlg-detail")?.remove();
  render();
  if (location.hash === "#/sources") scrollTo(0, 0);
}

async function locationFromLink(): Promise<GeoLocation | undefined> {
  const m = /^#\/at\/(gn:\d{1,10})$/.exec(location.hash);
  if (!m) return undefined;
  const saved = savedEntry(m[1]);
  if (saved) return saved.location;
  const featured = FEATURED.find((l) => l.id === m[1]);
  if (featured) return featured;
  try {
    const r = await fetch(`/api/feed?loc=${encodeURIComponent(m[1]!)}`);
    if (!r.ok) return undefined;
    return ((await r.json()) as Feed).location;
  } catch { return undefined; }
}

// ——— scroll: pin the city, slide the sheet over it, hand over to the compact bar ———
let heroH = 0, pinStart = 0, sheetEnd = 0, lastY = -1, lastP = -1, ticking = false;
let railLayout: RailLayout | null = null;
const flags = { scrolled: false, away: false, railOff: false };
/** All layout reads happen here, once per layout change (render, resize, fonts), never during scroll. */
function measure(): void {
  heroH = shell.offsetHeight;
  pinStart = Math.max(0, heroH - innerHeight);
  sheetEnd = sheet.offsetTop + sheet.offsetHeight;
  // a hero taller than the window scrolls until its bottom shows, then holds
  shell.style.setProperty("--pin-top", `${-pinStart}px`);
  railLayout = railMeasure(rail);
  lastP = -1;
  onScroll();
}
function setFlag(name: keyof typeof flags, cls: string, on: boolean): void {
  if (flags[name] === on) return;
  flags[name] = on;
  document.documentElement.classList.toggle(cls, on);
}
/** Scroll writes only: transforms and opacity on a handful of elements, and classes when they change. */
function onScroll(): void {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = scrollY;
    const p = heroH > pinStart ? Math.min(1, Math.max(0, (y - pinStart) / (heroH - pinStart))) : 0;
    if (Math.abs(p - lastP) > 0.001) {
      lastP = p;
      // the city leans back and dims as the paper covers it; the board drifts up a little faster than the paper
      stage.style.transform = p ? `scale(${(1 + p * 0.07).toFixed(4)})` : "";
      veil.style.opacity = (p * 0.75).toFixed(3);
      const board = heroSlot.querySelector<HTMLElement>(".board"), under = heroSlot.querySelector<HTMLElement>(".hero-under");
      if (board) board.style.transform = p ? `translate3d(0, ${(-48 * p).toFixed(1)}px, 0)` : "";
      if (under) under.style.transform = p ? `translate3d(0, ${(-24 * p).toFixed(1)}px, 0)` : "";
      fieldApi()?.setActive(p < 0.995);
    }
    const scrolled = y > heroH - 72;
    setFlag("scrolled", "scrolled", scrolled);
    // the first reading (e.g. a reload half-way down) shows the bar; after that, down hides it and up brings it back
    if (!scrolled || lastY < 0) setFlag("away", "bar-away", false);
    else if (y > lastY + 6) setFlag("away", "bar-away", true);
    else if (y < lastY - 6) setFlag("away", "bar-away", false);
    lastY = y;
    // the rail steps aside when the page's end (the footer) comes up
    setFlag("railOff", "rail-off", sheetEnd - y < innerHeight * 0.75);
    railUpdate(rail, railLayout, y);
  });
}

function installShell(): void {
  app.append(shell, sheet, footSlot);
  document.body.append(compact, railSlot);
  mountStage(stage);
  startClocks();
  installPointerFx();
  installGlide();
  addEventListener("scroll", onScroll, { passive: true });
  let narrow = innerWidth < 760;
  addEventListener("resize", () => { measure(); if ((innerWidth < 760) !== narrow) { narrow = !narrow; render(); } });
  if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(() => measure()); ro.observe(shell); ro.observe(sheet); }
  document.fonts?.ready.then(() => measure());
  // a touch on the city sends a ring through its streets
  shell.addEventListener("pointerdown", (e) => { if (!(e.target as Element).closest("a,button,input,select,label")) fieldApi()?.ripple(e.clientX, e.clientY); });
}

async function start(): Promise<void> {
  setLang(S.prefs.lang);
  document.documentElement.classList.add("js");
  if (S.prefs.lastVisit) S.previousVisit = Date.parse(S.prefs.lastVisit);
  const q = new URLSearchParams(location.search);
  if (q.get("now")) S.nowOverride = Date.parse(q.get("now")!); // honoured only for fixture data (see state.now)
  installShell();
  onRender(render);
  onSwitch((loc) => void switchLocation(loc));
  // "/" searches from anywhere (not while typing, and not with a dialog open)
  addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault(); focusSearch();
  });
  addEventListener("hashchange", async () => {
    if (location.hash.startsWith("#/at/")) { const l = await locationFromLink(); if (l) return void switchLocation(l); }
    route();
  });
  const linked = await locationFromLink();
  const initial = linked ?? savedEntry(S.prefs.activeId)?.location;
  if (initial) await switchLocation(initial, false);
  else render();
  // statuses and relative times move with the clock
  setInterval(() => { if (!document.querySelector("dialog[open]") && document.visibilityState === "visible") render(); }, 60_000);
  // remember this visit (after a moment, so a quick reload doesn't erase "new" marks)
  setTimeout(() => { S.prefs = { ...S.prefs, lastVisit: new Date().toISOString() }; save(S.prefs); }, 15_000);
}

void start();
