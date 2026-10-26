// A notice card: what, where, when, who published it, when we checked it, status, link to the original.
import { areaNames } from "../../domain/build.ts";
import type { Notice } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { dayClock, getLang, LANGS, M, rangeLabel, relative, tx } from "../i18n/index.ts";
import { S, update } from "../state.ts";
import { severityChip, statusChip, statusText } from "./status-ui.ts";

export function whereText(n: Notice): string {
  const m = M();
  const city = S.feed ? tx(S.feed.location.name) : "";
  if (n.scope === "region") {
    const reg = tx(n.regionLabel);
    return n.notes.includes("mentions-city") ? m.regionNamesCity(reg, city) : m.region(reg);
  }
  if (n.scope === "city") {
    const a = n.areas.map((x) => x.label).join(", ");
    return a ? `${a} · ${m.citywide(city)}` : m.citywide(city);
  }
  const names = tx(areaNames(n.locationId, n.areas));
  const streets = n.segments.flatMap((s) => s.streets);
  if (n.category === "roads" && streets.length) return streets.slice(0, 4).map((s) => s.replace(/\s*\(.*$/, "")).join(" · ");
  const near = n.notes.find((x) => /^within-\d+km$/.test(x));
  const suffix = near ? ` · ${m.withinKm(Number(/\d+/.exec(near)![0]), city)}` : "";
  if (names && streets.length) return `${names} · ${m.streets(streets.length)}${suffix}`;
  if (names) return names + suffix;
  if (streets.length) return streets.slice(0, 3).join(" · ");
  return m.areaNotStated;
}

export function isNew(n: Notice): boolean {
  if (!S.previousVisit) return false;
  const seen = Date.parse(n.firstSeenAt ?? n.updatedAt ?? n.publishedAt ?? "");
  return Number.isFinite(seen) && seen > S.previousVisit;
}

/** Shown when the source text is in another language than the interface. */
export function sourceLangNote(n: Notice): string | null {
  if (n.language === getLang()) return null;
  const name = (LANGS as Record<string, { label: string }>)[n.language]?.label ?? n.language;
  return M().publishedIn(name);
}

export function savedToggle(n: Notice, compact = true): HTMLButtonElement {
  const m = M();
  const on = S.prefs.savedNotices.includes(n.id);
  return h("button", {
    type: "button",
    class: `btn-icon save${on ? " on" : ""}${compact ? "" : " with-label"}`,
    "aria-pressed": on ? "true" : "false",
    "aria-label": on ? m.unsave : m.save,
    title: on ? m.saved : m.save,
    onclick: (e: Event) => {
      e.stopPropagation();
      update({ savedNotices: on ? S.prefs.savedNotices.filter((x) => x !== n.id) : [...S.prefs.savedNotices, n.id] });
    },
  }, icon("bookmark"), compact ? null : h("span", {}, on ? m.saved : m.save));
}

export function card(r: Row, now: number): HTMLElement {
  const m = M();
  const n = r.n;
  const when = rangeLabel(n.start, n.end, n.tz);
  const st = statusText(n, r.st, now);
  const headline = tx(n.headline);
  const untranslated = n.language !== getLang() && !n.headline[getLang()];
  const href = `#/n/${encodeURIComponent(n.id)}`;
  return h("article", { class: `card cat-${n.category} ${st.cls}${r.st.unverified ? " unverified" : ""}${r.priority ? " prio" : ""}`, "data-id": n.id },
    h("div", { class: "card-top" },
      h("span", { class: "cat" }, icon(n.category, "ic ic-s"), m.cat[n.category]),
      statusChip(r, now),
      severityChip(n),
      isNew(n) ? h("span", { class: "chip st-new" }, m.isNew) : null,
      n.fixture ? h("span", { class: "chip st-fixture" }, m.testData) : null,
      h("span", { class: "spacer" }),
      savedToggle(n),
    ),
    h("h3", { class: "card-title" }, h("a", { href, lang: untranslated ? n.language : null }, headline)),
    untranslated ? h("p", { class: "hint" }, sourceLangNote(n)) : null,
    h("dl", { class: "facts" },
      h("div", {}, h("dt", {}, icon("pin", "ic ic-s"), h("span", { class: "sr" }, m.where)), h("dd", {}, whereText(n),
        r.matched.length ? h("span", { class: "mine" }, ` · ${m.matches(r.matched.join(", "))}`) : null)),
      h("div", {}, h("dt", {}, icon("clock", "ic ic-s"), h("span", { class: "sr" }, m.when)), h("dd", {},
        when ?? (n.currentWhileListed ? m.liveStatusNoTimes : r.st.state === "open_ended" || r.st.state === "stale" ? m.noDatesAnnounced : m.noDatesOfEffect),
        st.detail ? h("span", { class: "rel" }, ` · ${st.detail}`) : null)),
    ),
    h("p", { class: "meta" },
      h("span", { class: "pub" }, tx(n.publisher), n.sources.length > 1 ? ` ${m.republications(n.sources.length - 1)}` : ""),
      n.publishedAt ? h("span", {}, `${m.published} `, h("time", { datetime: n.publishedAt }, dayClock(Date.parse(n.publishedAt), n.tz))) : null,
      n.updatedAt ? h("span", {}, `${m.updated} `, h("time", { datetime: n.updatedAt }, dayClock(Date.parse(n.updatedAt), n.tz))) : null,
      h("span", { class: r.st.unverified ? "checked warn" : "checked" }, `${r.st.unverified ? m.lastVerified : m.checked} `,
        h("time", { datetime: n.lastVerifiedAt }, relative(Date.parse(n.lastVerifiedAt), now))),
      h("a", { class: "src", href: n.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, m.original, icon("external", "ic ic-xs"), h("span", { class: "sr" }, ` ${m.newTab}`)),
    ),
  );
}
