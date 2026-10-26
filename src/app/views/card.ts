// A notice card: what, where, when, who published it, when we checked it, status, link to the original.
import { areaNames, CATEGORY_LABEL } from "../../domain/build.ts";
import type { Notice } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { dayClock, getLang, rangeLabel, relative, t, tx } from "../i18n.ts";
import { S, update } from "../state.ts";
import { severityChip, statusChip, statusText } from "./status-ui.ts";

export function whereText(n: Notice): string {
  if (n.scope === "region") {
    const reg = n.regionLabel ? tx(n.regionLabel) : "";
    return n.notes.includes("mentions-city") ? t(`Περιφέρεια ${reg} · αναφέρει ρητά τη Λάρισα`, `${reg} region · names Larissa explicitly`) : t(`Περιφέρεια ${reg}`, `${reg} region`);
  }
  if (n.scope === "city") return t("Όλη η πόλη", "Citywide");
  const names = tx(areaNames(n.cityId, n.areas));
  const streets = n.segments.flatMap((s) => s.streets);
  if (n.category === "roads" && streets.length) return streets.slice(0, 4).map((s) => s.replace(/\s*\(.*$/, "")).join(" · ");
  if (names && streets.length) return t(`${names} · ${streets.length} ${streets.length === 1 ? "οδός" : "οδοί"}`, `${names} · ${streets.length} ${streets.length === 1 ? "street" : "streets"}`);
  if (names) return names;
  if (streets.length) return streets.slice(0, 3).join(" · ");
  return t("Η περιοχή δεν αναφέρεται", "Area not stated");
}

export function isNew(n: Notice): boolean {
  if (!S.previousVisit) return false;
  const seen = Date.parse(n.firstSeenAt ?? n.updatedAt ?? n.publishedAt ?? "");
  return Number.isFinite(seen) && seen > S.previousVisit;
}

export function savedToggle(n: Notice, compact = true): HTMLButtonElement {
  const on = S.prefs.saved.includes(n.id);
  return h("button", {
    type: "button",
    class: `btn-icon save${on ? " on" : ""}${compact ? "" : " with-label"}`,
    "aria-pressed": on ? "true" : "false",
    "aria-label": on ? t("Αφαίρεση από τα αποθηκευμένα", "Remove from saved") : t("Αποθήκευση", "Save"),
    title: on ? t("Αποθηκευμένο", "Saved") : t("Αποθήκευση", "Save"),
    onclick: (e: Event) => {
      e.stopPropagation();
      update({ saved: on ? S.prefs.saved.filter((x) => x !== n.id) : [...S.prefs.saved, n.id] });
    },
  }, icon("bookmark"), compact ? null : h("span", {}, on ? t("Αποθηκεύτηκε", "Saved") : t("Αποθήκευση", "Save")));
}

export function card(r: Row, now: number): HTMLElement {
  const n = r.n;
  const when = rangeLabel(n.start, n.end);
  const st = statusText(n, r.st, now);
  const cat = CATEGORY_LABEL[n.category];
  const greekOnly = getLang() === "en" && n.headline.en === n.originalTitle;
  const href = `#/n/${encodeURIComponent(n.id)}`;
  return h("article", { class: `card cat-${n.category} ${st.cls}${r.st.unverified ? " unverified" : ""}${r.priority ? " prio" : ""}`, "data-id": n.id },
    h("div", { class: "card-top" },
      h("span", { class: "cat" }, icon(n.category, "ic ic-s"), tx(cat)),
      statusChip(r, now),
      severityChip(n),
      isNew(n) ? h("span", { class: "chip st-new" }, t("Νέο", "New")) : null,
      n.fixture ? h("span", { class: "chip st-fixture" }, t("Δοκιμαστικό", "Test data")) : null,
      h("span", { class: "spacer" }),
      savedToggle(n),
    ),
    h("h3", { class: "card-title" }, h("a", { href, lang: greekOnly ? "el" : null }, tx(n.headline))),
    greekOnly ? h("p", { class: "hint" }, t("", "Title in Greek, as published.")) : null,
    h("dl", { class: "facts" },
      h("div", {}, h("dt", {}, icon("pin", "ic ic-s"), h("span", { class: "sr" }, t("Πού", "Where"))), h("dd", {}, whereText(n),
        r.matched.length ? h("span", { class: "mine" }, t(` · αφορά: ${r.matched.join(", ")}`, ` · matches: ${r.matched.join(", ")}`)) : null)),
      h("div", {}, h("dt", {}, icon("clock", "ic ic-s"), h("span", { class: "sr" }, t("Πότε", "When"))), h("dd", {},
        when ?? (r.st.state === "open_ended" || r.st.state === "stale" ? t("Δεν ανακοινώθηκαν ημερομηνίες", "No dates announced") : t("Χωρίς ημερομηνίες εφαρμογής", "No dates of effect")),
        st.detail ? h("span", { class: "rel" }, ` · ${st.detail}`) : null)),
    ),
    h("p", { class: "meta" },
      h("span", { class: "pub" }, tx(n.publisher), n.sources.length > 1 ? t(` +${n.sources.length - 1} αναδημοσίευση`, ` +${n.sources.length - 1} republication`) : ""),
      n.publishedAt ? h("span", {}, t("Δημοσίευση ", "Published "), h("time", { datetime: n.publishedAt }, dayClock(Date.parse(n.publishedAt)))) : null,
      n.updatedAt ? h("span", {}, t("Ενημέρωση ", "Updated "), h("time", { datetime: n.updatedAt }, dayClock(Date.parse(n.updatedAt)))) : null,
      h("span", { class: r.st.unverified ? "checked warn" : "checked" }, r.st.unverified ? t("Επαληθεύτηκε τελευταία ", "Last verified ") : t("Ελέγχθηκε ", "Checked "),
        h("time", { datetime: n.lastVerifiedAt }, relative(Date.parse(n.lastVerifiedAt), now))),
      h("a", { class: "src", href: n.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, t("Πρωτότυπο", "Original"), icon("external", "ic ic-xs"), h("span", { class: "sr" }, t(" (ανοίγει νέα καρτέλα)", " (opens a new tab)"))),
    ),
  );
}
