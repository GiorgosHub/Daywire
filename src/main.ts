// DAYWIRE client: pick a location, load its feed, render the shell and the current route, keep statuses current.
// Routes: #/ (home), #/n/<notice id> (detail), #/sources, #/at/gn:<GeoNames id> (open a location by link).
import { FEATURED } from "./domain/localities.ts";
import type { Feed, GeoLocation } from "./domain/types.ts";
import { rows } from "./domain/view.ts";
import { clear, h, icon } from "./app/dom.ts";
import { clock, M, setLang, tx, zoneName } from "./app/i18n/index.ts";
import { lastFeed, rememberFeed, save } from "./app/prefs.ts";
import { failedSources, now, onRender, onSwitch, prefsHere, S, savedEntry } from "./app/state.ts";
import { openDetail } from "./app/views/detail.ts";
import { openLocations, openPrefs } from "./app/views/dialogs.ts";
import { banners, feedBody } from "./app/views/home.ts";
import { sourcesPage } from "./app/views/sources.ts";
import { wire } from "./app/views/wire.ts";

const app = document.getElementById("app")!;

function freshness(): HTMLElement {
  const m = M();
  const f = S.feed;
  if (!S.current) return h("span", { class: "fresh" }, m.noLocationYet);
  if (!f) return h("span", { class: "fresh" }, S.feedState === "error" ? m.notChecked : m.checking);
  const connected = f.sources.filter((s) => s.state !== "link-only" && s.state !== "needs-config");
  const ok = connected.filter((s) => s.state === "ok").length;
  const at = Date.parse(f.generatedAt);
  return h("a", { class: `fresh${!connected.length ? " none" : ok < connected.length || S.feedState === "cached" ? " warn" : ""}`, href: "#/sources", title: m.sourceStatus },
    h("span", { class: "fresh-dot", "aria-hidden": "true" }),
    connected.length ? m.checkedSources(clock(at, f.location.tz), ok, connected.length) : m.noConnectedSources);
}

function locationChips(): HTMLElement | null {
  const saved = S.prefs.locations;
  if (saved.length < 2) return null;
  return h("nav", { class: "loc-chips", "aria-label": M().yourLocations }, saved.map((s) => h("button", {
    type: "button", class: "loc-chip", "aria-current": s.location.id === S.current?.id ? "true" : null, onclick: () => switchLocation(s.location),
  }, s.label ? h("span", { class: "lc-label" }, s.label) : null, tx(s.location.name))));
}

/** Right side of the hero: today's wire, or for a place without sources its local time and coverage. */
function heroPanel(): HTMLElement | null {
  const m = M();
  const f = S.feed;
  if (!S.current) return null;
  if (!f) return h("div", { class: "wire wire-loading", "aria-hidden": "true" });
  if (f.coverage.level === "none") return h("section", { class: "wire wire-local", "aria-label": m.localTime("") },
    h("p", { class: "wl-big" }, clock(now(), f.location.tz)),
    h("p", { class: "wire-empty" }, `${tx(f.location.name)} · ${m.localTime(zoneName(now(), f.location.tz))}`),
    h("p", { class: "wire-empty" }, m.covLevel.none));
  return wire(rows(f.notices, prefsHere(), now(), failedSources()), now(), f.location.tz);
}

function header(): HTMLElement {
  const m = M();
  const cur = S.current;
  const n = cur ? (savedEntry()?.placeIds.length ?? 0) + (savedEntry()?.terms.length ?? 0) : 0;
  return h("header", { class: "top" },
    h("div", { class: "wrap top-in" },
      h("a", { class: "brand", href: "#/", "aria-label": "DAYWIRE" }, h("span", { class: "b-day" }, "DAY"), h("span", { class: "b-pulse", "aria-hidden": "true" }), h("span", { class: "b-wire" }, "WIRE")),
      h("nav", { class: "top-actions", "aria-label": m.mainNav },
        h("button", { type: "button", class: "place-btn", onclick: () => openLocations(), "aria-label": cur ? m.locationButton(tx(cur.name), tx(cur.country)) : m.chooseLocation },
          icon("pin", "ic ic-s"), h("span", { class: "pb-name" }, cur ? tx(cur.name) : m.chooseLocation), cur ? h("span", { class: "pb-cc" }, cur.countryCode) : null, n ? h("span", { class: "badge" }, `+${n}`) : null),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.searchNotices, title: m.searchNotices, disabled: !S.feed, onclick: () => { location.hash = "#/"; setTimeout(() => { const q = document.getElementById("q"); q?.scrollIntoView({ block: "center" }); q?.focus(); }, 0); } }, icon("search")),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.savedCount(S.prefs.savedNotices.length), title: m.saved, onclick: () => { S.filters = { ...S.filters, savedOnly: true }; location.hash = "#/"; render(); } }, icon("bookmark"), S.prefs.savedNotices.length ? h("span", { class: "dot-count" }, String(S.prefs.savedNotices.length)) : null),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": m.preferences, title: m.preferences, onclick: () => openPrefs() }, icon("sliders")),
      ),
    ),
    h("div", { class: "wrap hero" },
      h("div", { class: "hero-copy" },
        h("h1", {}, m.heroTitle),
        h("p", { class: "sub" }, m.heroSub),
        freshness(),
        locationChips(),
      ),
      heroPanel(),
    ),
  );
}

function footer(): HTMLElement {
  const m = M();
  return h("footer", { class: "foot" }, h("div", { class: "wrap foot-in" },
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
    clear(app);
    const route = location.hash.replace(/^#/, "") || "/";
    const t0 = now();
    app.append(header());
    const main = h("main", { id: "main", class: "wrap main", tabindex: "-1" });
    main.append(...banners());
    if (route.startsWith("/sources")) main.append(sourcesPage());
    else main.append(feedBody(S.feed && S.feed.location.id === S.current?.id ? rows(S.feed.notices, prefsHere(), t0, failedSources()) : [], t0));
    app.append(main, footer());
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

async function switchLocation(loc: GeoLocation): Promise<void> {
  S.current = loc;
  S.feed = undefined;
  S.feedState = "loading";
  S.filters = { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false };
  if (savedEntry(loc.id)) { S.prefs = { ...S.prefs, activeId: loc.id }; save(S.prefs); }
  if (location.hash.startsWith("#/at/") || location.hash.startsWith("#/n/")) history.replaceState(null, "", "#/");
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
    // the feed resolves the location server-side; ask it for just the location record
    const r = await fetch(`/api/feed?loc=${encodeURIComponent(m[1]!)}`);
    if (!r.ok) return undefined;
    const f = (await r.json()) as Feed;
    return f.location;
  } catch { return undefined; }
}

async function start(): Promise<void> {
  setLang(S.prefs.lang);
  if (S.prefs.lastVisit) S.previousVisit = Date.parse(S.prefs.lastVisit);
  const q = new URLSearchParams(location.search);
  if (q.get("now")) S.nowOverride = Date.parse(q.get("now")!); // honoured only for fixture data (see state.now)
  onRender(render);
  onSwitch((loc) => void switchLocation(loc));
  addEventListener("hashchange", async () => {
    if (location.hash.startsWith("#/at/")) { const l = await locationFromLink(); if (l) return void switchLocation(l); }
    route();
  });
  const linked = await locationFromLink();
  const initial = linked ?? savedEntry(S.prefs.activeId)?.location;
  if (initial) await switchLocation(initial);
  else render();
  // statuses and relative times move with the clock
  setInterval(() => { if (!document.querySelector("dialog[open]") && document.visibilityState === "visible") render(); }, 60_000);
  // remember this visit (after a moment, so a quick reload doesn't erase "new" marks)
  setTimeout(() => { S.prefs = { ...S.prefs, lastVisit: new Date().toISOString() }; save(S.prefs); }, 15_000);
}

void start();
