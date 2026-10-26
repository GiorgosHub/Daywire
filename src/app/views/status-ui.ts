// How each status reads on screen. Text always carries the meaning; colour and icon only reinforce it.
import type { Status } from "../../domain/status.ts";
import type { Notice } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { clock, dayClock, dayLabel, relative, t } from "../i18n.ts";

export function statusText(n: Notice, st: Status, now: number): { label: string; detail?: string; cls: string } {
  switch (st.state) {
    case "active":
      return { label: n.category === "weather" ? t("Σε ισχύ", "In force") : t("Σε εξέλιξη", "Happening now"), detail: st.endMs ? t(`λήγει ${relative(st.endMs, now)}`, `ends ${relative(st.endMs, now)}`) : undefined, cls: "st-active" };
    case "upcoming":
      return { label: t("Επόμενο", "Upcoming"), detail: st.startMs ? t(`ξεκινά ${relative(st.startMs, now)}`, `starts ${relative(st.startMs, now)}`) : undefined, cls: "st-upcoming" };
    case "open_ended":
      return { label: t("Σε ισχύ κατά την ανακοίνωση", "In effect when announced"), detail: t("δεν ανακοινώθηκε λήξη", "no end announced"), cls: "st-open" };
    case "ended":
      return { label: t("Αναμένεται να έχει λήξει", "Expected to have ended"), detail: st.endMs ? `${dayLabel(st.endMs)}, ${clock(st.endMs)}` : undefined, cls: "st-ended" };
    case "expired":
      return { label: t("Έληξε", "Expired"), detail: st.endMs ? dayClock(st.endMs) : undefined, cls: "st-ended" };
    case "stale":
      return { label: t("Μπορεί να μην ισχύει πια", "May no longer apply"), detail: t("η τελευταία ανακοίνωση είναι παλιά", "the last announcement is old"), cls: "st-stale" };
    case "archived":
      return { label: t("Αρχείο", "Archive"), cls: "st-ended" };
    default:
      return { label: t("Ανακοίνωση", "Notice"), cls: "st-info" };
  }
}

export function statusChip(r: Row, now: number): HTMLElement {
  const s = statusText(r.n, r.st, now);
  return h("span", { class: `chip ${s.cls}` }, h("span", { class: "chip-mark", "aria-hidden": "true" }), s.label);
}

export function severityChip(n: Notice): HTMLElement | null {
  if (!n.severity) return null;
  const lv = n.severity.level;
  const name = lv === "yellow" ? t("Κίτρινη", "Yellow") : lv === "orange" ? t("Πορτοκαλί", "Orange") : t("Κόκκινη", "Red");
  return h("span", { class: `chip sev sev-${lv}`, title: t("Επίπεδο της ΕΜΥ", "Level set by HNMS") }, icon("alert", "ic ic-s"), t(`${name} προειδοποίηση`, `${name} warning`));
}

/** The plain-language explanation of a status, for the detail view. */
export function statusExplain(n: Notice, st: Status): string {
  switch (st.state) {
    case "active": return n.endKind === "validity" ? t("Η προειδοποίηση ισχύει τώρα, σύμφωνα με τις ώρες που δημοσίευσε η ΕΜΥ.", "The warning is in force now, according to the times HNMS published.") : t("Σύμφωνα με τις ώρες της ανακοίνωσης, αυτή τη στιγμή είναι σε εξέλιξη.", "By the times in the announcement, this is happening now.");
    case "upcoming": return t("Η έναρξη είναι στο μέλλον, σύμφωνα με την ανακοίνωση.", "It starts in the future, according to the announcement.");
    case "open_ended": return t("Η ανακοίνωση το περιγράφει ως σε ισχύ, αλλά δεν δίνει ημερομηνία λήξης. Δεν υποθέτουμε μία. Ελέγξτε την πηγή για νεότερη ενημέρωση.", "The announcement describes it as in effect but gives no end date. We don't assume one. Check the source for newer updates.");
    case "ended": return t("Η ώρα λήξης που ανακοινώθηκε έχει περάσει. Η πηγή δεν δημοσιεύει επιβεβαίωση ότι ολοκληρώθηκε.", "The announced end time has passed. The source does not publish a confirmation that it finished.");
    case "expired": return t("Η περίοδος ισχύος της προειδοποίησης έχει λήξει.", "The warning's validity period is over.");
    case "stale": return t("Δεν υπάρχει ημερομηνία λήξης και η τελευταία ανακοίνωση είναι πάνω από 14 ημερών. Μπορεί να μην ισχύει πια.", "There is no end date and the last announcement is over 14 days old. It may no longer apply.");
    case "archived": return t("Παλιά ανακοίνωση, κρατιέται για αναζήτηση.", "An old notice, kept for search.");
    default: return t("Ενημέρωση χωρίς ημερομηνίες εφαρμογής.", "An update with no dates of effect.");
  }
}
