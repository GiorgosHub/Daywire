// Transparency page: every source, how it is read, its health, and the rules DAYWIRE applies.
import { h, icon } from "../dom.ts";
import { dayClock, t, tx } from "../i18n.ts";
import { S } from "../state.ts";

const METHOD: Record<string, [string, string]> = {
  rss: ["RSS", "RSS"], "wp-rest": ["WordPress REST API", "WordPress REST API"], "json-api": ["JSON API (CAP)", "JSON API (CAP)"], "link-only": ["Μόνο σύνδεσμος", "Link only"],
};
const STATE: Record<string, [string, string]> = {
  ok: ["Λειτουργεί", "Working"], error: ["Δεν απάντησε", "No response"], stale: ["Παλιά δεδομένα", "Stale data"], backoff: ["Σε παύση μετά από αποτυχίες", "Paused after failures"], "link-only": ["Δεν συνδέεται", "Not connected"],
};

export function sourcesPage(): HTMLElement {
  const f = S.feed;
  return h("div", { class: "page" },
    h("a", { href: "#/", class: "back" }, icon("back", "ic ic-s"), t("Πίσω στη μέρα σου", "Back to your day")),
    h("h1", {}, t("Πηγές και κανόνες", "Sources and rules")),
    h("p", { class: "lead" }, t("Το DAYWIRE δείχνει μόνο ό,τι δημοσιεύουν επίσημοι φορείς. Δεν γράφουμε δικές μας ειδήσεις, δεν συμπληρώνουμε κενά και δεν βαθμολογούμε τη σοβαρότητα.", "DAYWIRE only shows what official publishers post. We write no news of our own, fill no gaps and grade no severity.")),
    f ? h("div", { class: "table-wrap" }, h("table", { class: "src-table" },
      h("caption", { class: "sr" }, t("Κατάσταση πηγών", "Source status")),
      h("thead", {}, h("tr", {}, [t("Πηγή", "Source"), t("Μέθοδος", "Method"), t("Κατάσταση", "Status"), t("Τελευταίος έλεγχος", "Last check"), t("Εγγραφές", "Entries")].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, f.sources.map((s) => h("tr", { class: `s-${s.state}` },
        h("th", { scope: "row" }, h("a", { href: s.homepage, target: "_blank", rel: "noopener noreferrer" }, tx(s.name), icon("external", "ic ic-xs")), h("span", { class: "muted block" }, tx(s.publisher))),
        h("td", {}, t(...METHOD[s.method]!), s.endpoint ? h("code", { class: "block small" }, new URL(s.endpoint).host) : null),
        h("td", {}, h("span", { class: "src-dot", "aria-hidden": "true" }), t(...STATE[s.state]!), s.error ? h("span", { class: "muted block small" }, s.error) : null),
        h("td", {}, s.checkedAt ? dayClock(Date.parse(s.checkedAt)) : "—", s.lastSuccessAt && s.lastSuccessAt !== s.checkedAt ? h("span", { class: "muted block small" }, t(`επιτυχία ${dayClock(Date.parse(s.lastSuccessAt))}`, `success ${dayClock(Date.parse(s.lastSuccessAt))}`)) : null),
        h("td", {}, s.fetched !== undefined ? t(`${s.kept} από ${s.fetched}`, `${s.kept} of ${s.fetched}`) : "—"),
      ))))) : null,
    f ? h("div", { class: "notes" }, f.sources.map((s) => h("p", {}, h("strong", {}, tx(s.name)), ": ", tx(s.note)))) : null,
    h("h2", {}, t("Πώς ορίζουμε την κατάσταση", "How status is decided")),
    h("ul", { class: "rules" },
      h("li", {}, t("«Σε εξέλιξη» ή «Σε ισχύ»: τώρα είναι μέσα στις ώρες που δημοσίευσε η πηγή.", "“Happening now” / “In force”: now is within the hours the source published.")),
      h("li", {}, t("«Επόμενο»: η έναρξη είναι στο μέλλον.", "“Upcoming”: the start is in the future.")),
      h("li", {}, t("«Αναμένεται να έχει λήξει»: η ώρα λήξης πέρασε. Οι φορείς δεν δημοσιεύουν επιβεβαίωση ολοκλήρωσης.", "“Expected to have ended”: the end time has passed. Publishers don't confirm completion.")),
      h("li", {}, t("«Σε ισχύ κατά την ανακοίνωση»: δεν δόθηκε λήξη. Δεν επινοούμε μία· μετά από 14 ημέρες χωρίς νέα ανακοίνωση γίνεται «Μπορεί να μην ισχύει πια».", "“In effect when announced”: no end was given. We don't invent one; after 14 days without a newer notice it becomes “May no longer apply”.")),
      h("li", {}, t("«Δεν επαληθεύτηκε»: η πηγή δεν απάντησε στον τελευταίο έλεγχο ή ο έλεγχος είναι παλαιότερος από 6 ώρες. Βλέπετε την ώρα της τελευταίας επαλήθευσης.", "“Not verified”: the source failed at the last check, or the check is over 6 hours old. You see the last verification time.")),
      h("li", {}, t("Η σοβαρότητα (κίτρινη, πορτοκαλί, κόκκινη) υπάρχει μόνο στις προειδοποιήσεις της ΕΜΥ και είναι δική της.", "Severity (yellow, orange, red) exists only on HNMS warnings and is theirs.")),
      h("li", {}, t("Προτεραιότητα: πορτοκαλί/κόκκινες προειδοποιήσεις σε ισχύ ή μέσα σε 24 ώρες, και διακοπές νερού, ρεύματος ή δρόμων σε ισχύ ή μέσα σε 24 ώρες στα μέρη σου.", "Priority: orange/red warnings in force or within 24 hours, and water, power or road interruptions in force or within 24 hours in your places.")),
      h("li", {}, t("Διπλότυπα: όταν ΔΕΥΑΛ και δήμος δημοσιεύουν την ίδια διακοπή (ίδια ημέρα, ίδια περιοχή), τη δείχνουμε μία φορά με όλους τους συνδέσμους. Διαδοχικές ανακοινώσεις για τα ίδια έργα σε δρόμο ομαδοποιούνται, με τις παλαιότερες ως σχετικές.", "Duplicates: when DEYAL and the municipality publish the same interruption (same day, same area), we show it once with every link. Successive notices about the same road works are grouped, older ones listed as related.")),
    ),
    h("h2", {}, t("Ανανέωση", "Refresh")),
    h("p", {}, t("Οι πηγές ελέγχονται όταν κάποιος ανοίγει το DAYWIRE, το πολύ μία φορά ανά 5 λεπτά (οι απαντήσεις κρατιούνται 5 λεπτά). Αν μια πηγή αποτύχει 3 φορές, την αφήνουμε ήσυχη για 10 λεπτά. Οι φορείς δημοσιεύουν συνήθως λίγες φορές την ημέρα, άρα το DAYWIRE δεν είναι ποτέ πιο γρήγορο από αυτούς.", "Sources are checked when someone opens DAYWIRE, at most once every 5 minutes (responses are cached for 5 minutes). If a source fails 3 times we leave it alone for 10 minutes. Publishers usually post a few times a day, so DAYWIRE is never faster than they are.")),
    f && !f.durableStore ? h("p", { class: "muted" }, t("Αυτή η εγκατάσταση δεν έχει μόνιμη αποθήκευση, οπότε δεν δείχνουμε «πρώτη εμφάνιση» και, αν μια πηγή πέσει, κρατάμε τα τελευταία της δεδομένα μόνο για λίγο.", "This deployment has no durable store, so we don't show “first seen” and, if a source goes down, we keep its last data only briefly.")) : null,
    h("h2", {}, t("Τι δεν καλύπτουμε", "What we don't cover")),
    h("ul", { class: "rules" },
      h("li", {}, t("Έκτακτη ανάγκη: τα μηνύματα 112 φτάνουν απευθείας στο κινητό. Το DAYWIRE δεν τα αναμεταδίδει και δεν εγγυάται ειδοποίηση.", "Emergencies: 112 messages reach phones directly. DAYWIRE doesn't relay them and guarantees no notification."), " ", h("a", { href: "https://civilprotection.gov.gr/en/112", target: "_blank", rel: "noopener noreferrer" }, "112", icon("external", "ic ic-xs"))),
      h("li", {}, t("Διακοπές ρεύματος ΔΕΔΔΗΕ: μόνο σύνδεσμος (η σελίδα έχει προστασία κατά των αυτόματων επισκέψεων).", "HEDNO power cuts: link only (the page has bot protection).")),
      h("li", {}, t("Αστικές συγκοινωνίες: δεν βρήκαμε επαληθευμένη δημόσια ροή.", "City buses: we found no verified public feed.")),
      h("li", {}, t("Χάρτης: οι ανακοινώσεις δεν δίνουν συντεταγμένες και δεν τοποθετούμε πινέζες κατά προσέγγιση.", "Map: notices give no coordinates and we don't place approximate pins.")),
    ),
  );
}
