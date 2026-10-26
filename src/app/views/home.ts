// The homepage below the hero: state banners, overview, search and filters, the sections, the sources summary.
import { CATEGORY_LABEL } from "../../domain/build.ts";
import { cityById } from "../../domain/cities.ts";
import type { Category } from "../../domain/types.ts";
import { applyFilters, sections, type Row, type TimeFilter } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { clock, dayClock, relative, t, tx } from "../i18n.ts";
import { filtersActive, rerender, S, update } from "../state.ts";
import { card } from "./card.ts";
import { openPlaces } from "./dialogs.ts";

const CATS: Category[] = ["weather", "water", "roads", "services", "power", "transport", "emergency", "announcement"];

export function banners(now: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  const f = S.feed;
  if (f?.mode === "fixture") out.push(h("div", { class: "banner fixture", role: "note" }, icon("alert"), h("p", {},
    h("strong", {}, t("Δοκιμαστικά δεδομένα. ", "Test data. ")),
    t("Πραγματικές ανακοινώσεις που καταγράφηκαν στις 26/10/2026 για δοκιμές. Δεν είναι ζωντανή ροή.", "Real notices captured on 26/10/2026 for testing. This is not a live feed."))));
  if (S.feedState === "cached" && f) out.push(h("div", { class: "banner warn", role: "status" }, icon("alert"), h("p", {},
    h("strong", {}, t("Δεν μπορέσαμε να ελέγξουμε τις πηγές τώρα. ", "We couldn't check the sources just now. ")),
    t(`Δείχνουμε όσα ξέραμε στις ${dayClock(Date.parse(f.generatedAt))}. Μπορεί να έχουν αλλάξει.`, `Showing what we knew at ${dayClock(Date.parse(f.generatedAt))}. Things may have changed.`)),
    h("button", { type: "button", class: "btn small", onclick: () => location.reload() }, icon("refresh", "ic ic-s"), t("Δοκιμή ξανά", "Try again"))));
  if (S.feedState === "ok" && f) {
    const bad = f.sources.filter((s) => s.state === "error" || s.state === "stale" || s.state === "backoff");
    if (bad.length) out.push(h("div", { class: "banner warn", role: "status" }, icon("alert"), h("p", {},
      h("strong", {}, t(`${bad.length} ${bad.length === 1 ? "πηγή δεν απάντησε" : "πηγές δεν απάντησαν"} στον τελευταίο έλεγχο: `, `${bad.length} source${bad.length === 1 ? "" : "s"} did not respond at the last check: `)),
      bad.map((s) => tx(s.name)).join(", "), ". ",
      t("Ό,τι είχαμε από αυτές εμφανίζεται με την ώρα της τελευταίας επαλήθευσης.", "Anything we had from them is shown with its last verification time."))));
  }
  return out;
}

function overview(sec: ReturnType<typeof sections>, all: Row[]): HTMLElement {
  const city = cityById(S.prefs.cityId)!;
  const places = S.prefs.placeIds.map((id) => city.places.find((p) => p.id === id)).filter(Boolean).map((p) => tx(p!.name));
  const scopeLabel = [tx(city.name), ...places, ...S.prefs.terms].join(" · ");
  const newCount = S.previousVisit ? all.filter((r) => Date.parse(r.n.firstSeenAt ?? r.n.updatedAt ?? r.n.publishedAt ?? "") > S.previousVisit!).length : 0;
  const n = (v: number, el: string, en: string, _id: string) => h("div", { class: "ov-item" }, h("strong", { class: "ov-n" }, String(v)), h("span", {}, t(el, en)));
  return h("section", { class: "overview", "aria-label": t("Σύνοψη", "Overview") },
    h("div", { class: "ov-scope" },
      h("span", { class: "ov-for" }, t("Για ", "For "), h("strong", {}, scopeLabel)),
      h("button", { type: "button", class: "link", onclick: () => openPlaces() }, t("Αλλαγή", "Change")),
    ),
    h("div", { class: "ov-items" },
      n(sec.counts.inForce, "σε ισχύ τώρα", "in force now", "s-now"),
      n(sec.counts.next7, "τις επόμενες 7 ημέρες", "in the next 7 days", "s-upcoming"),
      n(sec.counts.endedRecently, "έληξαν τις τελευταίες 7 ημέρες", "ended in the last 7 days", "s-resolved"),
    ),
    newCount ? h("p", { class: "ov-new" }, t(`${newCount} νέες ή ενημερωμένες από την τελευταία σου επίσκεψη (${dayClock(S.previousVisit!)}).`, `${newCount} new or updated since your last visit (${dayClock(S.previousVisit!)}).`)) : null,
    h("p", { class: "ov-rule" }, t("Οι αριθμοί μετρούν τις ανακοινώσεις παρακάτω, από τις ημερομηνίες τους.", "Counts are the notices below, by their own dates.")),
  );
}

function placesPrompt(): HTMLElement | null {
  if (S.prefs.placeIds.length || S.prefs.terms.length || S.prefs.introDismissed) return null;
  const city = cityById(S.prefs.cityId)!;
  const quick = ["larisa-city", "giannouli", "falani", "pyrovolika", "agios-achilleios", "neapoli"].map((id) => city.places.find((p) => p.id === id)!).filter(Boolean);
  return h("section", { class: "prompt", "aria-labelledby": "prompt-h" },
    h("div", {},
      h("h2", { id: "prompt-h" }, t("Πού κινείσαι;", "Where are you during the day?")),
      h("p", {}, t("Διάλεξε γειτονιά ή γράψε μια οδό, για να βλέπεις πρώτα ό,τι σε αφορά. Δεν ζητάμε τοποθεσία, και οι επιλογές μένουν μόνο σε αυτή τη συσκευή.", "Pick a neighbourhood or type a street to see what affects you first. We never ask for your location, and your choices stay on this device.")),
    ),
    h("div", { class: "chips" },
      quick.map((p) => h("button", { type: "button", class: "chip-btn", onclick: () => update({ placeIds: [...S.prefs.placeIds, p.id] }) }, icon("plus", "ic ic-s"), tx(p.name))),
      h("button", { type: "button", class: "chip-btn ghost", onclick: () => openPlaces() }, t("Περισσότερα…", "More…")),
      h("button", { type: "button", class: "link", onclick: () => update({ introDismissed: true }) }, t("Όχι τώρα", "Not now")),
    ),
  );
}

function toolbar(): HTMLElement {
  const f = S.filters;
  const setF = (p: Partial<typeof f>) => { S.filters = { ...f, ...p }; rerender(); };
  const times: [TimeFilter, string, string][] = [["all", "Όλα", "All"], ["now", "Τώρα", "Now"], ["next7", "7 ημέρες", "7 days"], ["ended", "Έληξαν", "Ended"]];
  const publishers = [...new Set((S.feed?.notices ?? []).map((n) => n.publisher.el))];
  const input = h("input", {
    id: "q", type: "search", value: f.q, autocomplete: "off", spellcheck: "false",
    placeholder: t("π.χ. Γιάννουλη, Φαρσάλων, νερό", "e.g. Γιάννουλη, Φαρσάλων, water"),
    "aria-describedby": "q-hint",
  }) as HTMLInputElement;
  let timer = 0;
  input.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(() => { S.filters = { ...S.filters, q: input.value }; rerender(); document.getElementById("q")?.focus(); }, 180); });
  return h("section", { class: "toolbar", "aria-label": t("Αναζήτηση και φίλτρα", "Search and filters") },
    h("div", { class: "search" },
      h("label", { for: "q" }, icon("search"), h("span", { class: "sr" }, t("Αναζήτηση", "Search"))),
      input,
      f.q ? h("button", { type: "button", class: "btn-icon", "aria-label": t("Καθαρισμός", "Clear"), onclick: () => setF({ q: "" }) }, icon("close")) : null,
    ),
    h("p", { id: "q-hint", class: "sr" }, t("Δεν έχει σημασία αν γράψεις με τόνους ή χωρίς.", "Accents don't matter.")),
    h("div", { class: "filters" },
      h("div", { class: "seg", role: "group", "aria-label": t("Χρόνος", "Time") },
        times.map(([v, el, en]) => h("button", { type: "button", "aria-pressed": f.time === v ? "true" : "false", onclick: () => setF({ time: v }) }, t(el, en)))),
      h("div", { class: "chips", role: "group", "aria-label": t("Κατηγορίες", "Categories") },
        CATS.filter((c) => (S.feed?.notices ?? []).some((n) => n.category === c)).map((c) => {
          const on = f.categories.includes(c);
          return h("button", { type: "button", class: "chip-btn", "aria-pressed": on ? "true" : "false", onclick: () => setF({ categories: on ? f.categories.filter((x) => x !== c) : [...f.categories, c] }) }, icon(c, "ic ic-s"), tx(CATEGORY_LABEL[c]));
        })),
      h("div", { class: "chips" },
        h("button", { type: "button", class: "chip-btn", "aria-pressed": f.mineOnly ? "true" : "false", disabled: !(S.prefs.placeIds.length || S.prefs.terms.length), title: S.prefs.placeIds.length || S.prefs.terms.length ? null : t("Πρόσθεσε πρώτα ένα μέρος", "Add a place first"), onclick: () => setF({ mineOnly: !f.mineOnly }) }, icon("pin", "ic ic-s"), t("Τα μέρη μου", "My places")),
        h("button", { type: "button", class: "chip-btn", "aria-pressed": f.savedOnly ? "true" : "false", onclick: () => setF({ savedOnly: !f.savedOnly }) }, icon("bookmark", "ic ic-s"), t(`Αποθηκευμένα (${S.prefs.saved.length})`, `Saved (${S.prefs.saved.length})`)),
        publishers.length > 1 ? h("label", { class: "select" }, h("span", { class: "sr" }, t("Φορέας", "Publisher")),
          h("select", { onchange: (e: Event) => setF({ publisher: (e.target as HTMLSelectElement).value }) },
            h("option", { value: "" }, t("Όλοι οι φορείς", "All publishers")),
            publishers.map((p) => h("option", { value: p, selected: f.publisher === p }, p)))) : null,
      ),
    ),
  );
}

function section(id: string, title: string, rows: Row[], now: number, opts: { lead?: string; collapsed?: boolean; limit?: number } = {}): HTMLElement | null {
  if (!rows.length) return null;
  const limit = opts.limit ?? rows.length;
  const list = h("div", { class: "cards" }, rows.slice(0, limit).map((r) => card(r, now)));
  const body = [opts.lead ? h("p", { class: "lead" }, opts.lead) : null, list,
    rows.length > limit ? h("button", { type: "button", class: "btn ghost more", onclick: (e: Event) => { (e.currentTarget as HTMLElement).replaceWith(...rows.slice(limit).map((r) => card(r, now))); } }, t(`Δείτε άλλες ${rows.length - limit}`, `Show ${rows.length - limit} more`)) : null];
  if (opts.collapsed) {
    return h("section", { class: "sec", id, "aria-labelledby": `${id}-h` },
      h("details", {}, h("summary", {}, h("h2", { id: `${id}-h` }, title, h("span", { class: "count" }, String(rows.length))), icon("chevron", "ic chev")), ...body));
  }
  return h("section", { class: "sec", id, "aria-labelledby": `${id}-h` }, h("h2", { id: `${id}-h` }, title, h("span", { class: "count" }, String(rows.length))), ...body);
}

export function feedBody(all: Row[], now: number): HTMLElement {
  const out = h("div", { class: "feed" });
  const f = S.feed;
  if (!f) {
    if (S.feedState === "loading") out.append(h("div", { class: "skeleton", "aria-busy": "true", "aria-label": t("Φόρτωση", "Loading") }, [1, 2, 3].map(() => h("div", { class: "sk-card" }))));
    else out.append(h("div", { class: "state error", role: "alert" }, icon("alert"),
      h("h2", {}, t("Δεν μπορέσαμε να φέρουμε τα δεδομένα", "We couldn't load the data")),
      h("p", {}, t("Αυτό δεν σημαίνει ότι δεν υπάρχει τίποτα. Ο έλεγχος των πηγών απέτυχε. Ελέγξτε απευθείας τις επίσημες σελίδες ή δοκιμάστε ξανά.", "This doesn't mean there is nothing happening. The source check failed. Check the official pages directly or try again.")),
      h("button", { type: "button", class: "btn", onclick: () => location.reload() }, icon("refresh", "ic ic-s"), t("Δοκιμή ξανά", "Try again"))));
    return out;
  }
  const side = h("aside", { class: "col-side", "aria-label": t("Σύνοψη και πηγές", "Overview and sources") });
  const mainCol = h("div", { class: "col-main" });
  out.append(mainCol, side);
  const p = placesPrompt();
  const sec = sections(all, S.prefs, now);
  side.append(overview(sec, all));
  if (p) side.append(p);
  side.append(sourcesSummary(now));
  mainCol.append(toolbar());

  if (filtersActive()) {
    const res = applyFilters(all, S.filters, S.prefs, now).filter((r) => r.st.state !== "archived" || S.filters.q || S.filters.time === "ended")
      .sort((a, b) => Number(b.priority) - Number(a.priority) || Date.parse(b.n.publishedAt ?? "") - Date.parse(a.n.publishedAt ?? ""));
    mainCol.append(h("section", { class: "sec results", id: "s-results", tabindex: "-1", "aria-live": "polite" },
      h("h2", {}, t("Αποτελέσματα", "Results"), h("span", { class: "count" }, String(res.length)),
        h("button", { type: "button", class: "link", onclick: () => { S.filters = { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false }; rerender(); } }, t("Καθαρισμός φίλτρων", "Clear filters"))),
      res.length ? h("div", { class: "cards" }, res.map((r) => card(r, now)))
        : h("div", { class: "state empty" }, h("p", {}, S.filters.q ? t(`Τίποτα για «${S.filters.q}» στις ανακοινώσεις που έχουμε.`, `Nothing for “${S.filters.q}” in the notices we have.`) : t("Καμία ανακοίνωση με αυτά τα φίλτρα.", "No notices match these filters."),
            " ", t("Η αναζήτηση καλύπτει μόνο ό,τι δημοσίευσαν οι συνδεδεμένες πηγές.", "Search only covers what the connected sources published.")))));
    return out;
  }

  const live = sec.priority.length + sec.now.length + sec.upcoming.length;
  const okSources = f.sources.filter((s) => s.state === "ok").length;
  const connected = f.sources.filter((s) => s.method !== "link-only").length;
  if (!live && S.feedState === "ok") mainCol.append(h("div", { class: "state calm" }, icon("check"),
    h("p", {}, okSources === connected
      ? t(`Καμία ενεργή ή επερχόμενη διακοπή ή προειδοποίηση στις ${connected} συνδεδεμένες πηγές. Τελευταίος έλεγχος ${clock(Date.parse(f.generatedAt))}.`, `No active or upcoming interruptions or warnings in the ${connected} connected sources. Last checked ${clock(Date.parse(f.generatedAt))}.`)
      : t("Δεν βρήκαμε ενεργές ανακοινώσεις, αλλά κάποιες πηγές δεν απάντησαν, άρα η εικόνα είναι ελλιπής.", "We found no active notices, but some sources did not respond, so the picture is incomplete."))));

  mainCol.append(...[
    section("s-priority", t("Προτεραιότητα", "Priority"), sec.priority, now, { lead: t("Επίσημες πορτοκαλί/κόκκινες προειδοποιήσεις και διακοπές που ισχύουν ή ξεκινούν μέσα σε 24 ώρες στα μέρη σου.", "Official orange/red warnings, and interruptions in force or starting within 24 hours in your places.") }),
    section("s-now", t("Σε ισχύ", "In force"), sec.now, now),
    section("s-upcoming", t("Επόμενα", "Coming up"), sec.upcoming, now),
    section("s-other", t("Άλλες ενημερώσεις", "Other updates"), sec.other, now, { limit: 4 }),
    section("s-resolved", t("Έληξαν πρόσφατα", "Recently ended"), sec.resolved, now, { collapsed: true }),
  ].filter((x): x is HTMLElement => Boolean(x)));
  return out;
}

export function sourcesSummary(now: number): HTMLElement {
  const f = S.feed!;
  return h("section", { class: "sec sources-sum", id: "s-sources", "aria-labelledby": "src-h" },
    h("h2", { id: "src-h" }, t("Πηγές", "Sources")),
    h("ul", { class: "src-list" }, f.sources.map((s) => h("li", { class: `src-item s-${s.state}` },
      h("span", { class: "src-dot", "aria-hidden": "true" }),
      h("div", {},
        h("strong", {}, tx(s.name)), h("span", { class: "muted" }, ` · ${tx(s.publisher)}`),
        h("p", { class: "src-state" },
          s.state === "ok" ? t(`Ελέγχθηκε ${relative(Date.parse(s.checkedAt!), now)} · ${s.kept} από ${s.fetched} εγγραφές κρατήθηκαν`, `Checked ${relative(Date.parse(s.checkedAt!), now)} · kept ${s.kept} of ${s.fetched} entries`)
          : s.state === "link-only" ? t("Δεν συνδέεται αυτόματα · μόνο σύνδεσμος", "Not connected automatically · link only")
          : t(`Δεν απάντησε (${s.error ?? "σφάλμα"})${s.lastSuccessAt ? ` · τελευταία επιτυχία ${dayClock(Date.parse(s.lastSuccessAt))}` : ""}`, `No response (${s.error ?? "error"})${s.lastSuccessAt ? ` · last success ${dayClock(Date.parse(s.lastSuccessAt))}` : ""}`)),
        s.state === "link-only" ? h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, t("Άνοιγμα σελίδας", "Open page"), icon("external", "ic ic-xs")) : null,
      )))),
    h("p", {}, h("a", { href: "#/sources" }, t("Πώς δουλεύει το DAYWIRE και τι δεν καλύπτει", "How DAYWIRE works and what it doesn't cover"), icon("chevron", "ic ic-xs"))),
  );
}
