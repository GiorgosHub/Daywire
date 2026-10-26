// DAYWIRE client: pick a location, load its feed, render the current route, keep statuses current.
// Routes: #/ (home), #/n/<notice id> (detail), #/sources, #/at/gn:<GeoNames id> (open a location by link).
// The shell (the city field behind the hero, the compact bar) is built once; regions inside it re-render.
import { FEATURED } from "./domain/localities.ts";
import type { Feed, GeoLocation } from "./domain/types.ts";
import { rows } from "./domain/view.ts";
import { clear, h, icon } from "./app/dom.ts";
import { reducedMotion } from "./app/fx/loop.ts";
import { circleSwap, installPointerFx } from "./app/fx/motion.ts";
import { M, setLang, tx } from "./app/i18n/index.ts";
import { lastFeed, rememberFeed, save } from "./app/prefs.ts";
import { failedSources, now, onRender, onSwitch, prefsHere, S, savedEntry } from "./app/state.ts";
import { openDetail } from "./app/views/detail.ts";
import { openLocations, openPrefs } from "./app/views/dialogs.ts";
import { feedField, fieldApi, hero, liveClock, mountStage, startClocks } from "./app/views/hero.ts";
import { banners, feedBody } from "./app/views/home.ts";
import { sourcesPage } from "./app/views/sources.ts";

const app = document.getElementById("app")!;

// ——— persistent shell ———
const stage = h("div", { class: "stage", "aria-hidden": "true" }, h("div", { class: "stage-css" }));
const bar = h("div", { class: "wrap top-in" });
const heroSlot = h("div", { class: "hero-slot" });
const top = h("header", { class: "top" }, bar, heroSlot);
const shell = h("div", { class: "shell" }, stage, top);
const mainEl = h("main", { id: "main", class: "wrap main", tabindex: "-1" });
const footSlot = h("div");
const sheet = h("div", { class: "sheet" }, mainEl);
const compact = h("div", { class: "compact", "aria-hidden": "true" });

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
  return h("footer", { class: "foot" }, track,
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

function render(): void {
  keepFocus(() => {
    const route = location.hash.replace(/^#/, "") || "/";
    const t0 = now();
    const all = S.feed && S.feed.location.id === S.current?.id ? rows(S.feed.notices, prefsHere(), t0, failedSources()) : [];
    clear(bar); bar.append(...barContent());
    clear(heroSlot); heroSlot.append(hero(all, t0));
    clear(compact); compact.append(...compactContent());
    clear(mainEl);
    mainEl.append(...banners());
    if (route.startsWith("/sources")) mainEl.append(sourcesPage());
    else mainEl.append(feedBody(all, t0));
    clear(footSlot); footSlot.append(footer());
    feedField(S.feed, all, t0);
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
  if (animate) circleSwap(render); else render();
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

/** First visit in a session: the wire draws itself, then the city opens. Never blocks input. */
function intro(): void {
  let seen = false;
  try { seen = sessionStorage.getItem("daywire:intro") === "1"; sessionStorage.setItem("daywire:intro", "1"); } catch { /* storage blocked */ }
  if (seen || reducedMotion()) return;
  const el = h("div", { class: "intro", "aria-hidden": "true" }, h("div", { class: "intro-mark" }, h("span", {}, "DAY"), svgPulse(), h("span", {}, "WIRE")));
  document.body.append(el);
  setTimeout(() => el.classList.add("out"), 1050);
  setTimeout(() => el.remove(), 1800);
}

function installShell(): void {
  app.append(shell, sheet, footSlot);
  document.body.append(compact);
  mountStage(stage);
  startClocks();
  installPointerFx();
  // the compact bar appears once the hero has scrolled away
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(([e]) => document.documentElement.classList.toggle("scrolled", !e!.isIntersecting), { rootMargin: "-64px 0px 0px 0px" }).observe(heroSlot);
  }
  // a touch on the city sends a ring through its streets
  shell.addEventListener("pointerdown", (e) => { if (!(e.target as Element).closest("a,button,input,select,label")) fieldApi()?.ripple(e.clientX, e.clientY); });
}

async function start(): Promise<void> {
  setLang(S.prefs.lang);
  document.documentElement.classList.add("js");
  intro();
  if (S.prefs.lastVisit) S.previousVisit = Date.parse(S.prefs.lastVisit);
  const q = new URLSearchParams(location.search);
  if (q.get("now")) S.nowOverride = Date.parse(q.get("now")!); // honoured only for fixture data (see state.now)
  installShell();
  onRender(render);
  onSwitch((loc) => void switchLocation(loc));
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
