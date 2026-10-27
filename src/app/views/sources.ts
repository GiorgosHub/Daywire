// Transparency page: sources for the location being viewed (with health), every source in the registry and where it
// applies, and the rules DAYWIRE follows.
import type { Category, LText } from "../../domain/types.ts";
import { clear, h, icon } from "../dom.ts";
import { dayClock, M, num, tx } from "../i18n/index.ts";
import { S } from "../state.ts";
import { countryChip, coverageBadge, type CountryStatus } from "./home.ts";

interface RegistryRow { id: string; name: LText; publisher: LText; method: string; categories: Category[]; where: LText; homepage: string; note: LText; attribution?: LText; state: "connected" | "needs-config" | "link-only" }

interface CountryRow { code: string; name: LText; status: CountryStatus; sources: string[]; sourceNames: LText[]; covers: LText; gaps: LText }
interface Verified { on: string; realRecord: boolean }

let registry: (RegistryRow & { verified?: Verified })[] | undefined;
let countries: CountryRow[] | undefined;

function countryTable(box: HTMLElement): void {
  const m = M();
  clear(box);
  if (!countries || !registry) { box.append(h("p", { class: "muted" }, m.loading)); return; }
  const checked = (c: CountryRow) => {
    const v = c.sources.map((id) => registry!.find((s) => s.id === id)?.verified).filter(Boolean) as Verified[];
    return v.length ? [...new Set(v.map((x) => m.checkedOn(x.on, x.realRecord)))].join("; ") : "—";
  };
  box.append(h("div", { class: "table-wrap" }, h("table", { class: "src-table cty-table" },
    h("caption", { class: "sr" }, m.countriesTitle),
    h("thead", {}, h("tr", {}, [m.colCountry, m.colStatus, m.colCovers, m.colGaps, m.colChecked].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", {}, countries.map((c) => h("tr", { class: `cty-row-${c.status}` },
      h("th", { scope: "row" }, tx(c.name), c.sourceNames.length ? h("span", { class: "muted block small" }, c.sourceNames.map((n) => tx(n)).join(", ")) : null),
      h("td", {}, countryChip(c.status)),
      h("td", {}, tx(c.covers)),
      h("td", { class: "muted" }, tx(c.gaps)),
      h("td", { class: "small" }, checked(c)),
    ))))));
}

function registryTable(box: HTMLElement, cbox?: HTMLElement): void {
  const m = M();
  const draw = () => {
    clear(box);
    if (!registry) { box.append(h("p", { class: "muted" }, m.loading)); return; }
    box.append(h("div", { class: "table-wrap" }, h("table", { class: "src-table" },
      h("caption", { class: "sr" }, m.whereWeWork),
      h("thead", {}, h("tr", {}, [m.colSource, m.colWhere, m.colCategories, m.colState].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, registry.map((s) => h("tr", {},
        h("th", { scope: "row" }, h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, tx(s.name), icon("external", "ic ic-xs")), h("span", { class: "muted block small" }, tx(s.publisher))),
        h("td", {}, tx(s.where)),
        h("td", {}, s.categories.map((c) => m.cat[c]).join(", ")),
        h("td", {}, h("span", { class: `pill p-${s.state}` }, m.covState[s.state === "connected" ? "connected" : s.state]), h("span", { class: "muted block small" }, m.method[s.method as keyof typeof m.method] ?? s.method)),
      ))))));
    box.append(h("p", { class: "muted small" }, m.everywhereElse));
    if (cbox) countryTable(cbox);
  };
  draw();
  if (!registry) fetch("/api/sources").then((r) => r.json() as Promise<{ sources: RegistryRow[]; countries?: CountryRow[] }>).then((j) => { registry = j.sources; countries = j.countries ?? []; draw(); }).catch(() => { clear(box); box.append(h("p", { class: "muted" }, m.registryUnavailable)); });
}

export function sourcesPage(): HTMLElement {
  const m = M();
  const f = S.feed;
  const reg = h("div");
  const cty = h("div");
  registryTable(reg, cty);
  return h("div", { class: "page" },
    h("a", { href: "#/", class: "back" }, icon("back", "ic ic-s"), m.backToDay),
    h("h1", {}, m.sourcesTitle),
    h("p", { class: "lead" }, m.sourcesLead),
    f ? h("section", {},
      h("div", { class: "cov-head" }, h("h2", {}, m.sourcesHere(tx(f.location.name))), coverageBadge(f.coverage.level)),
      f.sources.length ? h("div", { class: "table-wrap" }, h("table", { class: "src-table" },
        h("caption", { class: "sr" }, m.sourceStatus),
        h("thead", {}, h("tr", {}, [m.colSource, m.colMethod, m.colState, m.colLastCheck, m.colEntries].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, f.sources.map((s) => h("tr", { class: `s-${s.state}` },
          h("th", { scope: "row" }, h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, tx(s.name), icon("external", "ic ic-xs")), h("span", { class: "muted block" }, tx(s.publisher))),
          h("td", {}, m.method[s.method], s.endpoint ? h("code", { class: "block small" }, new URL(s.endpoint.replace(/\{[a-z]+\}/g, "0")).host) : null),
          h("td", {}, h("span", { class: "src-dot", "aria-hidden": "true" }), m.srcState[s.state], s.error ? h("span", { class: "muted block small" }, s.error) : null),
          h("td", {}, s.checkedAt ? dayClock(Date.parse(s.checkedAt), f.location.tz) : "—", s.lastSuccessAt && s.lastSuccessAt !== s.checkedAt ? h("span", { class: "muted block small" }, m.lastSuccess(dayClock(Date.parse(s.lastSuccessAt), f.location.tz))) : null),
          h("td", {}, s.fetched !== undefined ? m.keptOf(num(s.kept ?? 0), num(s.fetched)) : "—"),
        ))))) : h("p", { class: "muted" }, m.noSourcesHere),
      h("div", { class: "notes" }, f.sources.map((s) => h("p", {}, h("strong", {}, tx(s.name)), ": ", tx(s.note), s.attribution ? h("span", { class: "muted" }, ` ${tx(s.attribution)}`) : null))),
    ) : null,
    h("h2", { id: "countries" }, m.countriesTitle),
    h("p", {}, m.countriesLead),
    cty,
    h("h2", { id: "where" }, m.whereWeWork),
    reg,
    h("h2", {}, m.rulesStatusTitle),
    h("ul", { class: "rules" }, m.rulesStatus.map((x) => h("li", {}, x))),
    h("h2", {}, m.rulesTimeTitle),
    h("p", {}, m.rulesTime),
    h("h2", {}, m.rulesRefreshTitle),
    h("p", {}, m.rulesRefresh),
    f && !f.durableStore ? h("p", { class: "muted" }, m.noDurableStore) : null,
    h("h2", {}, m.notCoveredTitle),
    h("ul", { class: "rules" }, m.notCovered.map((x) => h("li", {}, x))),
    h("p", { class: "muted small" }, m.geoAttribution),
  );
}
