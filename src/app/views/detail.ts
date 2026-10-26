// The detail view of one notice: everything the source supports, with the provenance of every date.
import { areaNames, CATEGORY_LABEL } from "../../domain/build.ts";
import { bounds } from "../../domain/status.ts";
import type { Notice, TimePoint } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { dayClock, dayLabel, getLang, rangeLabel, t, tx } from "../i18n.ts";
import { S } from "../state.ts";
import { savedToggle, whereText } from "./card.ts";
import { modal } from "./dialogs.ts";
import { severityChip, statusChip, statusExplain } from "./status-ui.ts";

const TZ = "Europe/Athens";

function provenance(tp: TimePoint): string {
  if (tp.from === "source-field") return t("πεδίο της πηγής", "source field");
  if (tp.from === "text") return t("από το κείμενο", "from the text");
  return t("από το κείμενο · έτος από την ημερομηνία δημοσίευσης", "from the text · year taken from the publication date");
}

function tpLabel(tp: TimePoint, edge: "start" | "end"): string {
  return tp.precision === "date" ? `${dayLabel(bounds(tp, "start", TZ))} ${t("(χωρίς ώρα)", "(no time given)")}` : dayClock(bounds(tp, edge, TZ));
}

function timeline(n: Notice): HTMLElement {
  const items: { ms: number; label: string; value: string; note?: string }[] = [];
  if (n.publishedAt) items.push({ ms: Date.parse(n.publishedAt), label: t("Δημοσιεύτηκε", "Published"), value: dayClock(Date.parse(n.publishedAt)), note: tx(n.publisher) });
  if (n.updatedAt) items.push({ ms: Date.parse(n.updatedAt), label: t("Ενημερώθηκε από την πηγή", "Updated by the source"), value: dayClock(Date.parse(n.updatedAt)) });
  if (n.start) items.push({ ms: bounds(n.start, "start", TZ), label: n.endKind === "validity" ? t("Ισχύει από", "Valid from") : t("Έναρξη", "Starts"), value: tpLabel(n.start, "start"), note: provenance(n.start) });
  if (n.end) items.push({ ms: bounds(n.end, "end", TZ) - 1, label: n.endKind === "validity" ? t("Ισχύει έως", "Valid until") : t("Λήξη", "Ends"), value: tpLabel(n.end, "end"), note: provenance(n.end) });
  if (n.firstSeenAt) items.push({ ms: Date.parse(n.firstSeenAt), label: t("Πρώτη εμφάνιση στο DAYWIRE", "First seen by DAYWIRE"), value: dayClock(Date.parse(n.firstSeenAt)) });
  items.push({ ms: Date.parse(n.lastVerifiedAt), label: t("Τελευταία επαλήθευση στην πηγή", "Last verified at the source"), value: dayClock(Date.parse(n.lastVerifiedAt)) });
  items.sort((a, b) => a.ms - b.ms);
  return h("ol", { class: "timeline" }, items.map((i) => h("li", {}, h("span", { class: "tl-l" }, i.label), h("span", { class: "tl-v" }, i.value), i.note ? h("span", { class: "tl-n" }, i.note) : null)));
}

export function openDetail(r: Row, now: number): void {
  const n = r.n;
  const contacts = n.category === "water" ? S.feed?.sources.find((s) => s.id === "deyal-water")?.contacts ?? [] : [];
  const showEn = getLang() === "en";
  modal("dlg-detail", tx(n.headline), () => [
    h("div", { class: "d-chips" }, statusChip(r, now), severityChip(n), h("span", { class: "cat" }, icon(n.category, "ic ic-s"), tx(CATEGORY_LABEL[n.category])), n.fixture ? h("span", { class: "chip st-fixture" }, t("Δοκιμαστικό", "Test data")) : null),
    h("p", { class: "d-explain" }, statusExplain(n, r.st), r.st.unverified ? h("strong", { class: "warn" }, t(` Δεν επαληθεύτηκε στον τελευταίο έλεγχο (τελευταία φορά ${dayClock(Date.parse(n.lastVerifiedAt))}).`, ` Not verified at the last check (last time ${dayClock(Date.parse(n.lastVerifiedAt))}).`)) : null),
    h("dl", { class: "d-facts" },
      h("div", {}, h("dt", {}, t("Πού", "Where")), h("dd", {}, whereText(n))),
      h("div", {}, h("dt", {}, t("Πότε", "When")), h("dd", {}, rangeLabel(n.start, n.end) ?? t("Δεν αναφέρονται ημερομηνίες", "No dates stated"))),
      h("div", {}, h("dt", {}, t("Φορέας", "Publisher")), h("dd", {}, tx(n.publisher))),
      h("div", {}, h("dt", {}, t("Αρχικός τίτλος", "Original title")), h("dd", { lang: "el" }, n.originalTitle)),
    ),
    n.segments.length > 1 || n.segments.some((s) => s.streets.length) ? h("section", { class: "d-sec" },
      h("h3", {}, t("Περιοχές και οδοί", "Areas and streets")),
      n.segments.map((s) => h("div", { class: "seg-block" },
        h("p", { class: "seg-h" }, h("strong", {}, tx(areaNames(n.cityId, s.areas)) || t("Χωρίς όνομα περιοχής", "No area name")), s.start || s.end ? ` · ${rangeLabel(s.start, s.end)}` : ""),
        s.streets.length ? h("ul", { class: "streets", lang: "el" }, s.streets.map((x) => h("li", {}, x))) : null))) : null,
    h("section", { class: "d-sec" }, h("h3", {}, t("Χρονολόγιο", "Timeline")), timeline(n)),
    h("section", { class: "d-sec" },
      h("h3", {}, showEn && n.bodyEn ? t("", "Official text (English, published by HNMS)") : t("Από την ανακοίνωση", "From the announcement (Greek)")),
      showEn && !n.bodyEn ? h("p", { class: "muted small" }, "Published in Greek only. We don't machine-translate official notices; open the original to read it in full.") : null,
      h("blockquote", { class: "quote", lang: showEn && n.bodyEn ? "en" : "el" }, (showEn && n.bodyEn ? n.bodyEn : n.body).split("\n").map((l) => h("p", {}, l))),
      n.action ? h("p", { class: "d-action" }, h("strong", {}, t("Τι ζητά η πηγή: ", "What the source asks: ")), h("q", { lang: "el" }, n.action)) : null,
    ),
    contacts.length ? h("section", { class: "d-sec" }, h("h3", {}, t("Επικοινωνία", "Contact")),
      h("ul", { class: "contacts" }, contacts.map((c) => h("li", {}, icon("phone", "ic ic-s"), tx(c.label), ": ", h("a", { href: `tel:${c.phone}` }, c.phone)))),
      h("p", { class: "muted small" }, t(`Από τον ιστότοπο της ΔΕΥΑΛ, ελέγχθηκε ${contacts[0]!.checkedOn}.`, `From DEYAL's website, checked ${contacts[0]!.checkedOn}.`))) : null,
    n.category === "weather" ? h("p", { class: "d-112" }, icon("emergency", "ic ic-s"), t("Σε κίνδυνο, ακολουθήστε τις οδηγίες των αρχών και τα μηνύματα 112. Το DAYWIRE δεν αντικαθιστά το 112.", "In danger, follow the authorities' instructions and 112 messages. DAYWIRE does not replace 112."), " ",
      h("a", { href: "https://civilprotection.gov.gr/en/112", target: "_blank", rel: "noopener noreferrer" }, "civilprotection.gov.gr/112", icon("external", "ic ic-xs"))) : null,
    h("section", { class: "d-sec" }, h("h3", {}, t("Πηγές", "Sources")),
      h("ul", { class: "d-sources" }, n.sources.map((s, i) => h("li", {},
        h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, i === 0 ? t("Πρωτότυπη ανακοίνωση", "Original notice") : t("Αναδημοσίευση", "Republished"), icon("external", "ic ic-xs")),
        h("span", { class: "muted" }, ` · ${tx(s.publisher)}${s.publishedAt ? ` · ${dayClock(Date.parse(s.publishedAt))}` : ""}`)))),
      n.notes.includes("no-per-warning-page") ? h("p", { class: "muted small" }, t("Η ΕΜΥ δεν δημοσιεύει ξεχωριστή σελίδα ανά προειδοποίηση· ο σύνδεσμος είναι αυτός που δίνει η ίδια η προειδοποίηση.", "HNMS publishes no page per warning; the link is the one the warning itself gives.")) : null,
      n.notes.includes("merged-duplicate") ? h("p", { class: "muted small" }, t("Η ίδια διακοπή δημοσιεύτηκε από περισσότερους φορείς· την εμφανίζουμε μία φορά.", "The same interruption was published by more than one publisher; we show it once.")) : null,
      n.related.length ? h("div", {}, h("p", { class: "small" }, h("strong", {}, t("Σχετικές προηγούμενες ανακοινώσεις για το ίδιο σημείο", "Earlier notices about the same place"))),
        h("ul", { class: "d-sources" }, n.related.map((x) => h("li", {}, h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer", lang: "el" }, x.title, icon("external", "ic ic-xs")), x.publishedAt ? h("span", { class: "muted" }, ` · ${dayClock(Date.parse(x.publishedAt))}`) : null))),
        n.notes.includes("start-from-related") ? h("p", { class: "muted small" }, t("Η ημερομηνία έναρξης προέρχεται από προηγούμενη ανακοίνωση για τα ίδια έργα.", "The start date comes from an earlier notice about the same works.")) : null) : null,
    ),
    h("div", { class: "d-actions" },
      h("a", { class: "btn", href: n.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, t("Άνοιγμα πρωτότυπου", "Open original"), icon("external", "ic ic-s")),
      savedToggle(n, false),
      h("button", { type: "button", class: "btn ghost", onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        try { await navigator.clipboard.writeText(location.href); b.lastChild!.textContent = t("Αντιγράφηκε", "Copied"); } catch { b.lastChild!.textContent = t("Δεν έγινε αντιγραφή", "Couldn't copy"); }
      } }, icon("link", "ic ic-s"), h("span", {}, t("Αντιγραφή συνδέσμου", "Copy link"))),
    ),
  ], { wide: true, onClose: () => { if (location.hash.startsWith("#/n/")) history.replaceState(null, "", "#/"); } });
}
