// Places and preferences dialogs (native <dialog>: focus is trapped and Escape closes).
import { CATEGORY_LABEL } from "../../domain/build.ts";
import { CITIES, cityById } from "../../domain/cities.ts";
import { fold } from "../../domain/greek.ts";
import type { Category } from "../../domain/types.ts";
import { clear, h, icon } from "../dom.ts";
import { setLang, t, tx, type Lang } from "../i18n.ts";
import { wipe } from "../prefs.ts";
import { rerender, S, update } from "../state.ts";

export function modal(id: string, title: string, body: (close: () => void) => (Node | null)[], opts: { wide?: boolean; onClose?: () => void } = {}): HTMLDialogElement {
  document.getElementById(id)?.remove();
  const opener = document.activeElement as HTMLElement | null;
  const dlg = h("dialog", { id, class: `dlg${opts.wide ? " wide" : ""}`, "aria-labelledby": `${id}-h` }) as HTMLDialogElement;
  const close = () => dlg.close();
  dlg.addEventListener("close", () => { dlg.remove(); opts.onClose?.(); opener?.focus?.(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.append(
    h("header", { class: "dlg-head" }, h("h2", { id: `${id}-h` }, title),
      h("button", { type: "button", class: "btn-icon", "aria-label": t("Κλείσιμο", "Close"), onclick: close }, icon("close"))),
    h("div", { class: "dlg-body" }, ...body(close).filter((x): x is Node => x !== null)),
  );
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function openPlaces(): void {
  const render = (box: HTMLElement, filter: string) => {
    clear(box);
    const city = cityById(S.prefs.cityId)!;
    const list = city.places.filter((p) => !filter || fold(tx(p.name)).includes(fold(filter)) || p.aliases.some((a) => fold(a).includes(fold(filter))));
    box.append(
      h("fieldset", { class: "places" }, h("legend", { class: "sr" }, t("Γειτονιές και κοινότητες", "Neighbourhoods and communities")),
        list.length ? list.map((p) => {
          const on = S.prefs.placeIds.includes(p.id);
          return h("label", { class: `place${on ? " on" : ""}` },
            h("input", { type: "checkbox", checked: on, onchange: () => { update({ placeIds: on ? S.prefs.placeIds.filter((x) => x !== p.id) : [...S.prefs.placeIds, p.id] }); render(box, filter); } }),
            h("span", {}, tx(p.name)), h("span", { class: "muted" }, p.kind === "community" ? t("κοινότητα", "community") : p.kind === "city" ? t("πόλη", "city") : ""));
        }) : h("p", { class: "muted" }, t("Καμία γειτονιά με αυτό το όνομα. Μπορείς να το προσθέσεις ως οδό ή περιοχή παρακάτω.", "No neighbourhood by that name. You can add it as a street or area below."))),
    );
  };
  modal("dlg-places", t("Τα μέρη μου", "My places"), () => {
    const box = h("div");
    const find = h("input", { type: "search", id: "place-find", placeholder: t("Αναζήτηση γειτονιάς", "Find a neighbourhood"), autocomplete: "off" }) as HTMLInputElement;
    find.addEventListener("input", () => render(box, find.value));
    render(box, "");
    const term = h("input", { type: "text", id: "term", maxlength: 60, placeholder: t("π.χ. Παλαιολόγου", "e.g. Παλαιολόγου"), autocomplete: "off" }) as HTMLInputElement;
    const terms = h("ul", { class: "terms" });
    const drawTerms = () => {
      clear(terms);
      for (const x of S.prefs.terms) terms.append(h("li", {}, x, h("button", { type: "button", class: "btn-icon small", "aria-label": t(`Αφαίρεση ${x}`, `Remove ${x}`), onclick: () => { update({ terms: S.prefs.terms.filter((y) => y !== x) }); drawTerms(); } }, icon("close", "ic ic-s"))));
    };
    drawTerms();
    const add = (e: Event) => {
      e.preventDefault();
      const v = term.value.trim();
      if (v.length < 3) { term.setCustomValidity(t("Τουλάχιστον 3 γράμματα", "At least 3 letters")); term.reportValidity(); return; }
      term.setCustomValidity("");
      if (!S.prefs.terms.some((x) => fold(x) === fold(v))) update({ terms: [...S.prefs.terms, v] });
      term.value = "";
      drawTerms();
    };
    term.addEventListener("input", () => term.setCustomValidity(""));
    return [
      h("label", { class: "field" }, h("span", {}, t("Πόλη", "City")),
        h("select", { disabled: CITIES.length < 2 }, CITIES.map((c) => h("option", { value: c.id, selected: c.id === S.prefs.cityId }, tx(c.name))))),
      h("p", { class: "muted small" }, t("Προς το παρόν μόνο η Λάρισα έχει συνδεδεμένες πηγές. Νέες πόλεις προστίθενται όταν επαληθεύσουμε τις πηγές τους.", "Only Larissa has connected sources for now. Cities are added once their sources are verified.")),
      h("label", { class: "field" }, h("span", {}, t("Γειτονιές και κοινότητες", "Neighbourhoods and communities")), find),
      box,
      h("form", { class: "field", onsubmit: add },
        h("label", { for: "term" }, t("Οδός ή περιοχή που σε ενδιαφέρει", "A street or area you care about")),
        h("div", { class: "row" }, term, h("button", { type: "submit", class: "btn" }, icon("plus", "ic ic-s"), t("Προσθήκη", "Add"))),
        h("p", { class: "muted small" }, t("Ταιριάζει με τις οδούς και περιοχές που αναφέρει ρητά μια ανακοίνωση. Δεν μαντεύουμε τι βρίσκεται κοντά.", "Matched against the streets and areas a notice names explicitly. We don't guess what is nearby.")),
      ),
      terms,
      h("p", { class: "muted small" }, t("Τα μέρη σου αποθηκεύονται μόνο σε αυτόν τον browser.", "Your places are stored only in this browser.")),
    ];
  }, { onClose: rerender });
}

export function openPrefs(): void {
  const cats: Category[] = ["weather", "water", "roads", "services", "power", "transport", "emergency", "announcement"];
  modal("dlg-prefs", t("Προτιμήσεις", "Preferences"), (close) => [
    h("fieldset", { class: "field" }, h("legend", {}, t("Γλώσσα", "Language")),
      h("div", { class: "seg" }, (["el", "en"] as Lang[]).map((l) => h("button", { type: "button", "aria-pressed": S.prefs.lang === l ? "true" : "false", lang: l, onclick: () => { setLang(l); update({ lang: l }); close(); openPrefs(); } }, l === "el" ? "Ελληνικά" : "English"))),
      h("p", { class: "muted small" }, t("Οι ανακοινώσεις μένουν στα ελληνικά, όπως δημοσιεύτηκαν. Μεταφράζουμε μόνο το περιβάλλον.", "Notices stay in Greek as published. Only the interface is translated."))),
    h("fieldset", { class: "field" }, h("legend", {}, t("Κατηγορίες που ακολουθείς", "Categories you follow")),
      h("p", { class: "muted small" }, t("Αν δεν επιλέξεις καμία, βλέπεις όλες. Οι ανακοινώσεις προτεραιότητας εμφανίζονται πάντα.", "Choose none to see all. Priority notices always show.")),
      h("div", { class: "checks" }, cats.map((c) => {
        const on = S.prefs.categories.includes(c);
        return h("label", { class: "check" }, h("input", { type: "checkbox", checked: on, onchange: () => update({ categories: on ? S.prefs.categories.filter((x) => x !== c) : [...S.prefs.categories, c] }) }), icon(c, "ic ic-s"), tx(CATEGORY_LABEL[c]));
      }))),
    h("fieldset", { class: "field" }, h("legend", {}, t("Ειδοποιήσεις", "Notifications")),
      h("p", { class: "muted small" }, t("Δεν στέλνουμε ειδοποιήσεις push. Όταν επιστρέφεις, σημειώνουμε ό,τι είναι νέο από την τελευταία σου επίσκεψη. Για έκτακτες ανάγκες ισχύει μόνο το 112.", "We don't send push notifications. When you come back, we mark what is new since your last visit. For emergencies, rely on 112."))),
    h("fieldset", { class: "field" }, h("legend", {}, t("Τα δεδομένα σου", "Your data")),
      h("p", { class: "muted small" }, t("Μέρη, αποθηκευμένα και προτιμήσεις μένουν μόνο σε αυτή τη συσκευή. Δεν έχουμε λογαριασμούς ούτε cookies παρακολούθησης.", "Places, saved items and preferences stay on this device. No accounts, no tracking cookies.")),
      h("button", { type: "button", class: "btn danger", onclick: (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = t("Πάτα ξανά για να διαγραφούν μέρη, αποθηκευμένα και προτιμήσεις", "Press again to delete places, saved items and preferences"); return; }
        wipe(); location.hash = "#/"; location.reload();
      } }, t("Διαγραφή όλων από αυτή τη συσκευή", "Delete everything from this device"))),
  ], { onClose: rerender });
}
