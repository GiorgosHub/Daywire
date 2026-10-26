// Transparency page: sources for the location being viewed (with health), every source in the registry and where it
// applies, and the rules DAYWIRE follows.
import type { Category, LText } from "../../domain/types.ts";
import { clear, h, icon } from "../dom.ts";
import { dayClock, M, num, tx } from "../i18n/index.ts";
import { S } from "../state.ts";
import { coverageBadge } from "./home.ts";

interface RegistryRow { id: string; name: LText; publisher: LText; method: string; categories: Category[]; where: LText; homepage: string; note: LText; attribution?: LText; state: "connected" | "needs-config" | "link-only" }

let registry: RegistryRow[] | undefined;

function registryTable(box: HTMLElement): void {
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
  };
  draw();
  if (!registry) fetch("/api/sources").then((r) => r.json() as Promise<{ sources: RegistryRow[] }>).then((j) => { registry = j.sources; draw(); }).catch(() => { clear(box); box.append(h("p", { class: "muted" }, m.registryUnavailable)); });
}

export function sourcesPage(): HTMLElement {
  const m = M();
  const f = S.feed;
  const reg = h("div");
  registryTable(reg);
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
