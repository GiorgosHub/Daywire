// DAYWIRE client: load the feed, render the shell and the current route, keep statuses current every minute.
import { cityById } from "./domain/cities.ts";
import type { Feed } from "./domain/types.ts";
import { rows } from "./domain/view.ts";
import { clear, h, icon } from "./app/dom.ts";
import { clock, setLang, t, tx } from "./app/i18n.ts";
import { lastFeed, rememberFeed, save } from "./app/prefs.ts";
import { failedSources, now, onRender, S } from "./app/state.ts";
import { openDetail } from "./app/views/detail.ts";
import { openPlaces, openPrefs } from "./app/views/dialogs.ts";
import { banners, feedBody } from "./app/views/home.ts";
import { sourcesPage } from "./app/views/sources.ts";
import { wire } from "./app/views/wire.ts";

const TZ = "Europe/Athens";
const app = document.getElementById("app")!;

function freshness(): HTMLElement {
  const f = S.feed;
  if (!f) return h("span", { class: "fresh" }, S.feedState === "loading" ? t("Έλεγχος πηγών…", "Checking sources…") : t("Οι πηγές δεν ελέγχθηκαν", "Sources not checked"));
  const connected = f.sources.filter((s) => s.method !== "link-only");
  const ok = connected.filter((s) => s.state === "ok").length;
  const at = Date.parse(f.generatedAt);
  return h("a", { class: `fresh${ok < connected.length || S.feedState === "cached" ? " warn" : ""}`, href: "#/sources", title: t("Κατάσταση πηγών", "Source status") },
    h("span", { class: "fresh-dot", "aria-hidden": "true" }),
    t(`Έλεγχος ${clock(at)}`, `Checked ${clock(at)}`), h("span", { class: "fresh-sep" }, " · "), t(`${ok}/${connected.length} πηγές`, `${ok}/${connected.length} sources`));
}

function header(): HTMLElement {
  const city = cityById(S.prefs.cityId)!;
  const n = S.prefs.placeIds.length + S.prefs.terms.length;
  return h("header", { class: "top" },
    h("div", { class: "wrap top-in" },
      h("a", { class: "brand", href: "#/", "aria-label": "DAYWIRE" }, h("span", { class: "b-day" }, "DAY"), h("span", { class: "b-pulse", "aria-hidden": "true" }), h("span", { class: "b-wire" }, "WIRE")),
      h("nav", { class: "top-actions", "aria-label": t("Κύρια", "Main") },
        h("button", { type: "button", class: "place-btn", onclick: () => openPlaces(), "aria-label": t(`Τοποθεσία: ${tx(city.name)}, ${n} μέρη. Αλλαγή`, `Location: ${tx(city.name)}, ${n} places. Change`) },
          icon("pin", "ic ic-s"), h("span", {}, tx(city.name)), n ? h("span", { class: "badge" }, `+${n}`) : null),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": t("Αναζήτηση", "Search"), title: t("Αναζήτηση", "Search"), onclick: () => { location.hash = "#/"; setTimeout(() => { const q = document.getElementById("q"); q?.scrollIntoView({ block: "center" }); q?.focus(); }, 0); } }, icon("search")),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": t(`Αποθηκευμένα (${S.prefs.saved.length})`, `Saved (${S.prefs.saved.length})`), title: t("Αποθηκευμένα", "Saved"), onclick: () => { S.filters = { ...S.filters, savedOnly: true }; location.hash = "#/"; render(); document.getElementById("s-results")?.focus(); } }, icon("bookmark"), S.prefs.saved.length ? h("span", { class: "dot-count" }, String(S.prefs.saved.length)) : null),
        h("button", { type: "button", class: "btn-icon on-dark", "aria-label": t("Προτιμήσεις", "Preferences"), title: t("Προτιμήσεις", "Preferences"), onclick: () => openPrefs() }, icon("sliders")),
      ),
    ),
    h("div", { class: "wrap hero" },
      h("div", { class: "hero-copy" },
        h("h1", {}, t("Η μέρα σου, με μια ματιά.", "Your day, at a glance.")),
        h("p", { class: "sub" }, t("Τοπικές αλλαγές. Επαληθευμένες πηγές. Λιγότερες απρόοπτες αναστατώσεις.", "Local changes. Verified sources. Less unexpected disruption.")),
        freshness(),
      ),
      S.feed ? wire(rows(S.feed.notices, S.prefs, now(), TZ, failedSources()), now()) : h("div", { class: "wire wire-loading", "aria-hidden": "true" }),
    ),
  );
}

function footer(): HTMLElement {
  return h("footer", { class: "foot" }, h("div", { class: "wrap foot-in" },
    h("p", { class: "f-112" }, icon("emergency", "ic ic-s"), h("span", {}, h("strong", {}, t("Έκτακτη ανάγκη: 112. ", "Emergency: 112. ")), t("Το DAYWIRE δεν αντικαθιστά τα μηνύματα 112 ούτε εγγυάται ειδοποίηση.", "DAYWIRE does not replace 112 alerts or guarantee any notification."))),
    h("p", { class: "muted" }, t("Ανεξάρτητη υπηρεσία, όχι επίσημος φορέας. Κάθε ανακοίνωση οδηγεί στην πρωτότυπη πηγή.", "An independent service, not an official body. Every notice links to its original source."), " ",
      h("a", { href: "#/sources" }, t("Πηγές και κανόνες", "Sources and rules"))),
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
    main.append(...banners(t0));
    if (route.startsWith("/sources")) main.append(sourcesPage());
    else main.append(feedBody(S.feed ? rows(S.feed.notices, S.prefs, t0, TZ, failedSources()) : [], t0));
    app.append(main, footer());
    document.title = route.startsWith("/sources") ? t("Πηγές · DAYWIRE", "Sources · DAYWIRE") : "DAYWIRE";
  });
}

function route(): void {
  const m = /^#\/n\/(.+)$/.exec(location.hash);
  if (m && S.feed) {
    const id = decodeURIComponent(m[1]!);
    const r = rows(S.feed.notices, S.prefs, now(), TZ, failedSources()).find((x) => x.n.id === id);
    if (r) { if (!document.getElementById("dlg-detail")) { render(); openDetail(r, now()); } return; }
  }
  document.getElementById("dlg-detail")?.remove();
  render();
  if (location.hash === "#/sources") scrollTo(0, 0);
}

async function loadFeed(): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`/api/feed?city=${encodeURIComponent(S.prefs.cityId)}`, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const f = (await r.json()) as Feed;
    if (f.version !== 1 || !Array.isArray(f.notices) || !Array.isArray(f.sources)) throw new Error("unexpected response");
    S.feed = f; S.feedState = "ok";
    if (f.mode === "live") rememberFeed(f);
  } catch (e) {
    const cached = lastFeed();
    S.error = e instanceof Error ? e.message : String(e);
    if (cached) { S.feed = cached; S.feedState = "cached"; } else S.feedState = "error";
  } finally { clearTimeout(timer); }
}

async function start(): Promise<void> {
  setLang(S.prefs.lang);
  if (S.prefs.lastVisit) S.previousVisit = Date.parse(S.prefs.lastVisit);
  const q = new URLSearchParams(location.search);
  if (q.get("now")) S.nowOverride = Date.parse(q.get("now")!); // honoured only for fixture data (see state.now)
  onRender(render);
  render();
  await loadFeed();
  route();
  addEventListener("hashchange", route);
  // statuses and relative times move with the clock
  setInterval(() => { if (!document.querySelector("dialog[open]") && document.visibilityState === "visible") render(); }, 60_000);
  // remember this visit (after a moment, so a quick reload doesn't erase "new" marks)
  setTimeout(() => { S.prefs = { ...S.prefs, lastVisit: new Date().toISOString() }; save(S.prefs); }, 15_000);
}

void start();
