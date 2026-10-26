// The detail view of one notice: everything the source supports, with the provenance of every date.
import { areaNames } from "../../domain/build.ts";
import { bounds } from "../../domain/status.ts";
import type { Notice, TimePoint } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { dayClock, dayLabel, getLang, LANGS, M, rangeLabel, tx, zoneName } from "../i18n/index.ts";
import { S } from "../state.ts";
import { savedToggle, sourceLangNote, whereText } from "./card.ts";
import { modal } from "./dialogs.ts";
import { severityChip, statusChip, statusExplain } from "./status-ui.ts";

function provenance(tp: TimePoint, tz: string, at: number): string {
  const m = M();
  if (tp.from === "source-field") return m.provSource;
  if (tp.from === "source-field-no-tz") return m.provNoTz(zoneName(at, tz));
  if (tp.from === "text") return m.provText;
  return m.provYear;
}

function tpLabel(tp: TimePoint, edge: "start" | "end", tz: string): string {
  return tp.precision === "date" ? `${dayLabel(Date.parse(tp.at + "T12:00:00Z"), "UTC")} ${M().noTimeGiven}` : dayClock(bounds(tp, edge, tz), tz);
}

function timeline(n: Notice): HTMLElement {
  const m = M();
  const tz = n.tz;
  const items: { ms: number; label: string; value: string; note?: string }[] = [];
  if (n.publishedAt) items.push({ ms: Date.parse(n.publishedAt), label: m.tlPublished, value: dayClock(Date.parse(n.publishedAt), tz), note: tx(n.publisher) });
  if (n.updatedAt) items.push({ ms: Date.parse(n.updatedAt), label: m.tlUpdated, value: dayClock(Date.parse(n.updatedAt), tz) });
  if (n.start) { const ms = bounds(n.start, "start", tz); items.push({ ms, label: n.endKind === "validity" ? m.tlValidFrom : m.tlStarts, value: tpLabel(n.start, "start", tz), note: provenance(n.start, tz, ms) }); }
  if (n.end) { const ms = bounds(n.end, "end", tz) - 1; items.push({ ms, label: n.endKind === "validity" ? m.tlValidUntil : m.tlEnds, value: tpLabel(n.end, "end", tz), note: provenance(n.end, tz, ms) }); }
  if (n.firstSeenAt) items.push({ ms: Date.parse(n.firstSeenAt), label: m.tlFirstSeen, value: dayClock(Date.parse(n.firstSeenAt), tz) });
  items.push({ ms: Date.parse(n.lastVerifiedAt), label: m.tlVerified, value: dayClock(Date.parse(n.lastVerifiedAt), tz) });
  items.sort((a, b) => a.ms - b.ms);
  return h("ol", { class: "timeline" }, items.map((i) => h("li", {}, h("span", { class: "tl-l" }, i.label), h("span", { class: "tl-v" }, i.value), i.note ? h("span", { class: "tl-n" }, i.note) : null)));
}

const langName = (l: string) => (LANGS as Record<string, { label: string }>)[l]?.label ?? l;

export function openDetail(r: Row, now: number): void {
  const m = M();
  const n = r.n;
  const contacts = S.feed?.sources.filter((s) => n.sources.some((x) => x.sourceId === s.id)).flatMap((s) => s.contacts ?? []) ?? [];
  // the source's own version in the interface language, if it published one; never a machine translation
  const alt = n.language !== getLang() ? n.bodyAlt.find((b) => b.lang === getLang()) : undefined;
  const text = alt?.text ?? n.body;
  const textLang = alt?.lang ?? n.language;
  modal("dlg-detail", tx(n.headline), () => [
    h("div", { class: "d-chips" }, statusChip(r, now), severityChip(n), h("span", { class: "cat" }, icon(n.category, "ic ic-s"), m.cat[n.category]), n.fixture ? h("span", { class: "chip st-fixture" }, m.testData) : null),
    h("p", { class: "d-explain" }, statusExplain(n, r.st), r.st.unverified ? h("strong", { class: "warn" }, ` ${m.notVerifiedSince(dayClock(Date.parse(n.lastVerifiedAt), n.tz))}`) : null),
    h("dl", { class: "d-facts" },
      h("div", {}, h("dt", {}, m.where), h("dd", {}, whereText(n))),
      h("div", {}, h("dt", {}, m.when), h("dd", {}, rangeLabel(n.start, n.end, n.tz) ?? (n.currentWhileListed ? m.liveStatusNoTimes : m.noDatesStated))),
      n.severity ? h("div", {}, h("dt", {}, m.classification), h("dd", {}, `${tx(n.severity.label)}${n.severity.hazard ? ` · ${tx(n.severity.hazard)}` : ""}`, h("span", { class: "muted small block" }, m.severityBy(tx(n.publisher))))) : null,
      h("div", {}, h("dt", {}, m.publisher), h("dd", {}, tx(n.publisher))),
      h("div", {}, h("dt", {}, m.originalTitle), h("dd", { lang: n.language }, n.originalTitle)),
    ),
    n.segments.length > 1 || n.segments.some((s) => s.streets.length) ? h("section", { class: "d-sec" },
      h("h3", {}, m.areasAndStreets),
      n.segments.map((s) => h("div", { class: "seg-block" },
        h("p", { class: "seg-h" }, h("strong", {}, tx(areaNames(n.locationId, s.areas)) || m.noAreaName), s.start || s.end ? ` · ${rangeLabel(s.start, s.end, n.tz)}` : ""),
        s.streets.length ? h("ul", { class: "streets", lang: n.language }, s.streets.map((x) => h("li", {}, x))) : null))) : null,
    h("section", { class: "d-sec" }, h("h3", {}, m.timeline), timeline(n)),
    h("section", { class: "d-sec" },
      h("h3", {}, alt ? m.officialVersionIn(langName(textLang)) : m.fromAnnouncement(langName(textLang))),
      !alt && n.language !== getLang() ? h("p", { class: "muted small" }, `${sourceLangNote(n)} ${m.noMachineTranslation}`) : null,
      h("blockquote", { class: "quote", lang: textLang }, text.split("\n").filter(Boolean).map((l) => h("p", {}, l))),
      n.action ? h("p", { class: "d-action" }, h("strong", {}, `${m.whatSourceAsks} `), h("q", { lang: n.language }, n.action)) : null,
    ),
    contacts.length ? h("section", { class: "d-sec" }, h("h3", {}, m.contact),
      h("ul", { class: "contacts" }, contacts.map((c) => h("li", {}, icon("phone", "ic ic-s"), tx(c.label), ": ", h("a", { href: `tel:${c.phone}` }, c.phone)))),
      h("p", { class: "muted small" }, m.contactChecked(contacts[0]!.checkedOn))) : null,
    n.category === "weather" || n.category === "emergency" ? h("p", { class: "d-112" }, icon("emergency", "ic ic-s"), m.emergencyNote) : null,
    h("section", { class: "d-sec" }, h("h3", {}, m.sources),
      h("ul", { class: "d-sources" }, n.sources.map((s, i) => h("li", {},
        h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, i === 0 ? (n.notes.includes("official-alert-record") ? m.officialRecord : m.originalNotice) : m.republished, icon("external", "ic ic-xs")),
        h("span", { class: "muted" }, ` · ${tx(s.publisher)}${s.publishedAt ? ` · ${dayClock(Date.parse(s.publishedAt), n.tz)}` : ""}`)))),
      n.notes.includes("no-per-warning-page") ? h("p", { class: "muted small" }, m.noPerWarningPage) : null,
      n.notes.includes("no-tz-source-times") ? h("p", { class: "muted small" }, m.noTzNote) : null,
      n.notes.includes("live-status") ? h("p", { class: "muted small" }, m.liveStatusNote) : null,
      n.notes.includes("merged-duplicate") ? h("p", { class: "muted small" }, m.mergedNote) : null,
      n.related.length ? h("div", {}, h("p", { class: "small" }, h("strong", {}, m.relatedTitle)),
        h("ul", { class: "d-sources" }, n.related.map((x) => h("li", {}, h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer", lang: n.language }, x.title, icon("external", "ic ic-xs")), x.publishedAt ? h("span", { class: "muted" }, ` · ${dayClock(Date.parse(x.publishedAt), n.tz)}`) : null))),
        n.notes.includes("start-from-related") ? h("p", { class: "muted small" }, m.startFromRelated) : null) : null,
    ),
    h("div", { class: "d-actions" },
      h("a", { class: "btn", href: n.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, m.openOriginal, icon("external", "ic ic-s")),
      savedToggle(n, false),
      h("button", { type: "button", class: "btn ghost", onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        try { await navigator.clipboard.writeText(location.href); b.lastChild!.textContent = m.copied; } catch { b.lastChild!.textContent = m.copyFailed; }
      } }, icon("link", "ic ic-s"), h("span", {}, m.copyLink)),
    ),
  ], { wide: true, ...(S.lastRect ? { from: S.lastRect } : {}), onClose: () => { S.lastRect = undefined; if (location.hash.startsWith("#/n/")) history.replaceState(null, "", "#/"); } });
}
