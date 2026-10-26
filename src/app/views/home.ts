// The homepage below the hero: state banners, coverage, overview, search and filters, sections, sources.
import { localityFor } from "../../domain/localities.ts";
import type { Category, Coverage, Feed } from "../../domain/types.ts";
import { applyFilters, sections, type Row, type TimeFilter } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { clock, dayClock, M, num, relative, tx } from "../i18n/index.ts";
import { filtersActive, isSaved, prefsHere, rerender, S, saveLocation, savedEntry, update, updateEntry } from "../state.ts";
import { card } from "./card.ts";
import { openLocations, openPlaces } from "./dialogs.ts";

const ORDER: Category[] = ["weather", "water", "roads", "transport", "power", "services", "emergency", "announcement"];

export function banners(): HTMLElement[] {
  const m = M();
  const out: HTMLElement[] = [];
  const f = S.feed;
  if (f?.mode === "fixture") out.push(h("div", { class: "banner fixture", role: "note" }, icon("alert"), h("p", {}, h("strong", {}, `${m.fixtureTitle} `), m.fixtureBody)));
  if (S.feedState === "cached" && f) out.push(h("div", { class: "banner warn", role: "status" }, icon("alert"), h("p", {},
    h("strong", {}, `${m.cachedTitle} `), m.cachedBody(dayClock(Date.parse(f.generatedAt), f.location.tz))),
    h("button", { type: "button", class: "btn small", onclick: () => location.reload() }, icon("refresh", "ic ic-s"), m.tryAgain)));
  if (S.feedState === "ok" && f) {
    const connected = f.sources.filter((s) => s.state !== "link-only" && s.state !== "needs-config");
    const bad = connected.filter((s) => s.state === "error" || s.state === "stale" || s.state === "backoff");
    if (bad.length && bad.length === connected.length) out.push(h("div", { class: "banner warn", role: "status" }, icon("alert"), h("p", {}, h("strong", {}, `${m.allDownTitle} `), m.allDownBody)));
    else if (bad.length) out.push(h("div", { class: "banner warn", role: "status" }, icon("alert"), h("p", {},
      h("strong", {}, `${m.someDown(bad.length)} `), bad.map((s) => tx(s.name)).join(", "), ". ", m.someDownBody)));
  }
  if (S.current && !isSaved() && f) out.push(h("div", { class: "banner info", role: "note" }, icon("pin"), h("p", {}, m.notSavedYet(tx(S.current.name))),
    h("button", { type: "button", class: "btn small", onclick: () => saveLocation(S.current!) }, icon("plus", "ic ic-s"), m.followThis)));
  return out;
}

export function coverageBadge(level: Coverage["level"]): HTMLElement {
  return h("span", { class: `cov cov-${level}` }, h("span", { class: "cov-bars", "aria-hidden": "true" }, h("i"), h("i"), h("i")), M().covLevel[level]);
}

function coveragePanel(f: Feed): HTMLElement {
  const m = M();
  const byCat = new Map(f.coverage.categories.map((c) => [c.category, c]));
  const name = (id: string) => tx(f.sources.find((s) => s.id === id)?.name) || id;
  return h("section", { class: "coverage", "aria-labelledby": "cov-h" },
    h("div", { class: "cov-head" }, h("h2", { id: "cov-h" }, m.coverageTitle), coverageBadge(f.coverage.level)),
    h("p", { class: "cov-lead" }, m.covLead[f.coverage.level](tx(f.location.name))),
    h("ul", { class: "cov-list" }, ORDER.map((c) => {
      const cc = byCat.get(c)!;
      return h("li", { class: `cov-${cc.state}` },
        h("span", { class: "cov-cat" }, icon(c, "ic ic-s"), m.cat[c]),
        h("span", { class: "cov-state" }, m.covState[cc.state], cc.sources.length && cc.state !== "none" ? h("span", { class: "muted" }, ` · ${cc.sources.map(name).join(", ")}`) : null));
    })),
    h("p", { class: "small" }, h("a", { href: "#/sources" }, m.howItWorks, icon("chevron", "ic ic-xs"))),
  );
}

function overview(sec: ReturnType<typeof sections>, all: Row[], f: Feed): HTMLElement {
  const m = M();
  const loc = f.location;
  const entry = savedEntry();
  const locality = localityFor(loc.geonameId);
  const places = (entry?.placeIds ?? []).map((id) => locality?.places.find((p) => p.id === id)).filter(Boolean).map((p) => tx(p!.name));
  const scopeLabel = [tx(loc.name), ...places, ...(entry?.terms ?? [])].join(" · ");
  const newCount = S.previousVisit ? all.filter((r) => Date.parse(r.n.firstSeenAt ?? r.n.updatedAt ?? r.n.publishedAt ?? "") > S.previousVisit!).length : 0;
  const n = (v: number, label: string) => h("div", { class: "ov-item" }, h("strong", { class: "ov-n" }, num(v)), h("span", {}, label));
  return h("section", { class: "overview", "aria-label": m.overview },
    h("div", { class: "ov-scope" },
      h("span", { class: "ov-for" }, `${m.forPlace} `, h("strong", {}, scopeLabel)),
      isSaved() ? h("button", { type: "button", class: "link", onclick: () => openPlaces() }, m.change) : null,
    ),
    h("div", { class: "ov-cov" }, coverageBadge(f.coverage.level)),
    h("div", { class: "ov-items" }, n(sec.counts.inForce, m.ovInForce), n(sec.counts.next7, m.ovNext7), n(sec.counts.endedRecently, m.ovEnded)),
    newCount ? h("p", { class: "ov-new" }, m.newSince(newCount, dayClock(S.previousVisit!, loc.tz))) : null,
    h("p", { class: "ov-rule" }, m.ovRule),
  );
}

function placesPrompt(f: Feed): HTMLElement | null {
  const m = M();
  const entry = savedEntry();
  const locality = localityFor(f.location.geonameId);
  if (!entry || !locality || entry.placeIds.length || entry.terms.length || S.prefs.dismissed.includes(f.location.id)) return null;
  const quick = locality.quick.map((id) => locality.places.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  return h("section", { class: "prompt", "aria-labelledby": "prompt-h" },
    h("div", {}, h("h2", { id: "prompt-h" }, m.promptTitle), h("p", {}, m.promptBody)),
    h("div", { class: "chips" },
      quick.map((p) => h("button", { type: "button", class: "chip-btn", onclick: () => updateEntry(f.location.id, { placeIds: [...entry.placeIds, p.id] }) }, icon("plus", "ic ic-s"), tx(p.name))),
      h("button", { type: "button", class: "chip-btn ghost", onclick: () => openPlaces() }, m.more),
      h("button", { type: "button", class: "link", onclick: () => update({ dismissed: [...S.prefs.dismissed, f.location.id] }) }, m.notNow),
    ),
  );
}

function toolbar(): HTMLElement {
  const m = M();
  const f = S.filters;
  const setF = (p: Partial<typeof f>) => { S.filters = { ...f, ...p }; rerender(); };
  const times: [TimeFilter, string][] = [["all", m.tAll], ["now", m.tNow], ["next7", m.t7], ["ended", m.tEnded]];
  const publishers = [...new Map((S.feed?.notices ?? []).map((n) => [n.publisher.en, n.publisher])).values()];
  const entry = savedEntry();
  const hasPlaces = Boolean(entry && (entry.placeIds.length || entry.terms.length));
  const input = h("input", { id: "q", type: "search", value: f.q, autocomplete: "off", spellcheck: "false", placeholder: m.searchPlaceholder, "aria-describedby": "q-hint" }) as HTMLInputElement;
  let timer = 0;
  input.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(() => { S.filters = { ...S.filters, q: input.value }; rerender(); }, 180); });
  return h("section", { class: "toolbar", "aria-label": m.searchAndFilters },
    h("div", { class: "search" },
      h("label", { for: "q" }, icon("search"), h("span", { class: "sr" }, m.searchNotices)),
      input,
      f.q ? h("button", { type: "button", class: "btn-icon", "aria-label": m.clear, onclick: () => setF({ q: "" }) }, icon("close")) : null,
    ),
    h("p", { id: "q-hint", class: "sr" }, m.accentsHint),
    h("div", { class: "filters" },
      h("div", { class: "seg", role: "group", "aria-label": m.time }, times.map(([v, l]) => h("button", { type: "button", "aria-pressed": f.time === v ? "true" : "false", onclick: () => setF({ time: v }) }, l))),
      h("div", { class: "chips", role: "group", "aria-label": m.categories },
        ORDER.filter((c) => (S.feed?.notices ?? []).some((n) => n.category === c)).map((c) => {
          const on = f.categories.includes(c);
          return h("button", { type: "button", class: "chip-btn", "aria-pressed": on ? "true" : "false", onclick: () => setF({ categories: on ? f.categories.filter((x) => x !== c) : [...f.categories, c] }) }, icon(c, "ic ic-s"), m.cat[c]);
        })),
      h("div", { class: "chips" },
        h("button", { type: "button", class: "chip-btn", "aria-pressed": f.mineOnly ? "true" : "false", disabled: !hasPlaces, title: hasPlaces ? null : m.addPlaceFirst, onclick: () => setF({ mineOnly: !f.mineOnly }) }, icon("pin", "ic ic-s"), m.myPlaces),
        h("button", { type: "button", class: "chip-btn", "aria-pressed": f.savedOnly ? "true" : "false", onclick: () => setF({ savedOnly: !f.savedOnly }) }, icon("bookmark", "ic ic-s"), m.savedCount(S.prefs.savedNotices.length)),
        publishers.length > 1 ? h("label", { class: "select" }, h("span", { class: "sr" }, m.publisher),
          h("select", { onchange: (e: Event) => setF({ publisher: (e.target as HTMLSelectElement).value }) },
            h("option", { value: "" }, m.allPublishers),
            publishers.map((p) => h("option", { value: p.en, selected: f.publisher === p.en }, tx(p))))) : null,
      ),
    ),
  );
}

function section(id: string, title: string, rows: Row[], now: number, opts: { lead?: string; collapsed?: boolean; limit?: number } = {}): HTMLElement | null {
  if (!rows.length) return null;
  const limit = opts.limit ?? rows.length;
  const list = h("div", { class: "cards" }, rows.slice(0, limit).map((r) => card(r, now)));
  const body = [opts.lead ? h("p", { class: "lead" }, opts.lead) : null, list,
    rows.length > limit ? h("button", { type: "button", class: "btn ghost more", onclick: (e: Event) => { (e.currentTarget as HTMLElement).replaceWith(...rows.slice(limit).map((r) => card(r, now))); } }, M().showMore(rows.length - limit)) : null];
  const head = h("h2", { id: `${id}-h` }, title, h("span", { class: "count" }, num(rows.length)));
  if (opts.collapsed) return h("section", { class: "sec", id, "aria-labelledby": `${id}-h` }, h("details", {}, h("summary", {}, head, icon("chevron", "ic chev")), ...body));
  return h("section", { class: "sec", id, "aria-labelledby": `${id}-h` }, head, ...body);
}

/** For a location without connected sources: what we know, what is missing, and why. Never an empty feed. */
function noCoverage(f: Feed): HTMLElement {
  const m = M();
  const links = f.sources.filter((s) => s.state === "link-only");
  const waiting = f.sources.filter((s) => s.state === "needs-config");
  return h("section", { class: "nocov", "aria-labelledby": "nocov-h" },
    h("div", { class: "nocov-head" }, h("h2", { id: "nocov-h" }, m.noCovTitle(tx(f.location.name))), coverageBadge("none")),
    h("p", {}, m.noCovBody),
    h("p", { class: "muted" }, m.noCovNotEmpty),
    h("ul", { class: "cov-list" }, ORDER.map((c) => {
      const cc = f.coverage.categories.find((x) => x.category === c)!;
      return h("li", { class: `cov-${cc.state}` }, h("span", { class: "cov-cat" }, icon(c, "ic ic-s"), m.cat[c]), h("span", { class: "cov-state" }, m.covState[cc.state]));
    })),
    links.length ? h("div", {}, h("h3", {}, m.officialLinks), h("ul", { class: "links" }, links.map((s) => h("li", {}, h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, tx(s.name), icon("external", "ic ic-xs")), h("span", { class: "muted" }, ` · ${tx(s.note)}`))))) : null,
    waiting.length ? h("p", { class: "muted small" }, m.waitingConfig(waiting.map((s) => tx(s.name)).join(", "))) : null,
    h("div", { class: "chips" },
      h("button", { type: "button", class: "btn", onclick: () => openLocations() }, icon("search", "ic ic-s"), m.chooseAnother),
      h("a", { class: "btn ghost", href: "#/sources" }, m.whereWeWork)),
  );
}

export function chooser(): HTMLElement {
  const m = M();
  return h("section", { class: "nocov chooser", "aria-labelledby": "choose-h" },
    h("h2", { id: "choose-h" }, m.chooseTitle),
    h("p", {}, m.chooseBody),
    h("div", { class: "chips" },
      h("button", { type: "button", class: "btn", onclick: () => openLocations() }, icon("search", "ic ic-s"), m.findLocation),
      h("a", { class: "btn ghost", href: "#/sources" }, m.whereWeWork)),
  );
}

export function feedBody(all: Row[], now: number): HTMLElement {
  const m = M();
  const out = h("div", { class: "feed" });
  const f = S.feed;
  if (!S.current) { out.append(chooser()); return out; }
  if (!f) {
    if (S.feedState === "loading" || S.feedState === "idle") out.append(h("div", { class: "skeleton", "aria-busy": "true", "aria-label": m.loading }, [1, 2, 3].map(() => h("div", { class: "sk-card" }))));
    else out.append(h("div", { class: "state error", role: "alert" }, icon("alert"), h("h2", {}, m.loadFailTitle), h("p", {}, m.loadFailBody),
      h("button", { type: "button", class: "btn", onclick: () => location.reload() }, icon("refresh", "ic ic-s"), m.tryAgain)));
    return out;
  }
  if (f.coverage.level === "none") { out.append(noCoverage(f)); return out; }

  const side = h("aside", { class: "col-side", "aria-label": m.overviewAndCoverage });
  const mainCol = h("div", { class: "col-main" });
  out.append(mainCol, side);
  const p = prefsHere();
  const sec = sections(all, p, now);
  side.append(overview(sec, all, f));
  const pr = placesPrompt(f);
  if (pr) side.append(pr);
  side.append(coveragePanel(f), sourcesSummary(now));
  mainCol.append(toolbar());

  if (filtersActive()) {
    const res = applyFilters(all, S.filters, p, now, (n) => [m.cat[n.category]]).filter((r) => r.st.state !== "archived" || S.filters.q || S.filters.time === "ended")
      .sort((a, b) => Number(b.priority) - Number(a.priority) || Date.parse(b.n.publishedAt ?? "") - Date.parse(a.n.publishedAt ?? ""));
    mainCol.append(h("section", { class: "sec results", id: "s-results", tabindex: "-1", "aria-live": "polite" },
      h("h2", {}, m.results, h("span", { class: "count" }, num(res.length)),
        h("button", { type: "button", class: "link", onclick: () => { S.filters = { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false }; rerender(); } }, m.clearFilters)),
      res.length ? h("div", { class: "cards" }, res.map((r) => card(r, now)))
        : h("div", { class: "state empty" }, h("p", {}, S.filters.q ? m.noResultsFor(S.filters.q) : m.noResults, " ", m.searchScope))));
    return out;
  }

  const live = sec.priority.length + sec.now.length + sec.upcoming.length;
  const connected = f.sources.filter((s) => s.state !== "link-only" && s.state !== "needs-config");
  const okCount = connected.filter((s) => s.state === "ok").length;
  const missing = f.coverage.categories.filter((c) => c.state !== "connected" && c.category !== "announcement").map((c) => m.cat[c.category].toLowerCase());
  if (!live && S.feedState === "ok") mainCol.append(h("div", { class: `state ${okCount === connected.length ? "calm" : "empty"}` }, icon(okCount === connected.length ? "check" : "alert"),
    h("p", {}, okCount === connected.length ? m.calm(connected.length, clock(Date.parse(f.generatedAt), f.location.tz)) : m.calmIncomplete,
      missing.length ? h("span", { class: "muted block small" }, m.calmNotCovered(missing.join(", "))) : null)));

  mainCol.append(...[
    section("s-priority", m.secPriority, sec.priority, now, { lead: m.secPriorityLead }),
    section("s-now", m.secNow, sec.now, now),
    section("s-upcoming", m.secUpcoming, sec.upcoming, now),
    section("s-other", m.secOther, sec.other, now, { limit: 4 }),
    section("s-resolved", m.secResolved, sec.resolved, now, { collapsed: true }),
  ].filter((x): x is HTMLElement => Boolean(x)));
  return out;
}

export function sourcesSummary(now: number): HTMLElement {
  const m = M();
  const f = S.feed!;
  const attributions = [...new Set(f.sources.map((s) => s.attribution).filter(Boolean).map((a) => tx(a)))];
  return h("section", { class: "sources-sum", id: "s-sources", "aria-labelledby": "src-h" },
    h("h2", { id: "src-h" }, m.sources),
    h("ul", { class: "src-list" }, f.sources.map((s) => h("li", { class: `src-item s-${s.state}` },
      h("span", { class: "src-dot", "aria-hidden": "true" }),
      h("div", {},
        h("strong", {}, tx(s.name)), h("span", { class: "muted" }, ` · ${tx(s.publisher)}`),
        h("p", { class: "src-state" },
          s.state === "ok" ? m.srcOk(relative(Date.parse(s.checkedAt!), now), s.kept ?? 0, s.fetched ?? 0)
          : s.state === "link-only" ? m.srcLinkOnly
          : s.state === "needs-config" ? m.srcNeedsConfig
          : m.srcFailed(s.error ?? "", s.lastSuccessAt ? dayClock(Date.parse(s.lastSuccessAt), f.location.tz) : null)),
        s.state === "link-only" ? h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, m.openPage, icon("external", "ic ic-xs")) : null,
      )))),
    attributions.length ? h("p", { class: "attrib" }, attributions.join(" ")) : null,
  );
}
