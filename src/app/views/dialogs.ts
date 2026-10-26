// Dialogs (native <dialog>: focus is trapped and Escape closes): location picker, places, preferences.
import { localityFor } from "../../domain/localities.ts";
import { fold } from "../../domain/greek.ts";
import type { Coverage, GeoLocation } from "../../domain/types.ts";
import { CATEGORIES } from "../../domain/categories.ts";
import { clear, h, icon } from "../dom.ts";
import { clock, getLang, LANGS, M, setLang, tx, type Lang } from "../i18n/index.ts";
import { wipe } from "../prefs.ts";
import { removeLocation, rerender, S, saveLocation, savedEntry, switchTo, update, updateEntry } from "../state.ts";
import { coverageBadge } from "./home.ts";

export function modal(id: string, title: string, body: (close: () => void) => (Node | null)[], opts: { wide?: boolean; onClose?: () => void } = {}): HTMLDialogElement {
  document.getElementById(id)?.remove();
  const opener = document.activeElement as HTMLElement | null;
  const dlg = h("dialog", { id, class: `dlg${opts.wide ? " wide" : ""}`, "aria-labelledby": `${id}-h` }) as HTMLDialogElement;
  const close = () => dlg.close();
  dlg.addEventListener("close", () => { dlg.remove(); opts.onClose?.(); opener?.focus?.(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.append(
    h("header", { class: "dlg-head" }, h("h2", { id: `${id}-h` }, title),
      h("button", { type: "button", class: "btn-icon", "aria-label": M().close, onclick: close }, icon("close"))),
    h("div", { class: "dlg-body" }, ...body(close).filter((x): x is Node => x !== null)),
  );
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

type Hit = { location: GeoLocation; coverage: Pick<Coverage, "level" | "connected"> & { categories: string[] } };

export const placeLine = (l: GeoLocation) => [tx(l.admin1), tx(l.country)].filter(Boolean).join(", ");

/** Worldwide location search (no GPS), saved locations, and the places where DAYWIRE has sources. */
export function openLocations(): void {
  const m = M();
  let ctl: AbortController | undefined;
  let hits: Hit[] = [];
  let active = -1;
  const input = h("input", {
    id: "loc-q", type: "search", autocomplete: "off", spellcheck: "false", placeholder: m.locSearchPlaceholder,
    role: "combobox", "aria-expanded": "false", "aria-controls": "loc-results", "aria-autocomplete": "list", "aria-describedby": "loc-hint",
  }) as HTMLInputElement;
  const status = h("p", { id: "loc-status", class: "muted small", role: "status", "aria-live": "polite" });
  const list = h("ul", { id: "loc-results", class: "loc-results", role: "listbox", "aria-label": m.locResults });
  const idle = h("div", { class: "loc-idle" });

  let close: () => void = () => {};
  const choose = (loc: GeoLocation) => { close(); switchTo(loc); };

  const option = (hit: Hit, i: number) => {
    const l = hit.location;
    return h("li", { id: `loc-opt-${i}`, role: "option", class: "loc-opt", "aria-selected": i === active ? "true" : "false", onclick: () => choose(l) },
      h("span", { class: "loc-main" }, h("strong", {}, tx(l.name)), h("span", { class: "muted" }, ` · ${placeLine(l)}`)),
      h("span", { class: "loc-meta" }, coverageBadge(hit.coverage.level), h("span", { class: "muted small" }, m.localTime(clock(Date.now(), l.tz)))),
    );
  };
  const drawHits = () => {
    clear(list);
    list.append(...hits.map(option));
    input.setAttribute("aria-expanded", hits.length ? "true" : "false");
    if (active >= 0) input.setAttribute("aria-activedescendant", `loc-opt-${active}`); else input.removeAttribute("aria-activedescendant");
    idle.hidden = Boolean(input.value.trim());
  };

  let timer = 0;
  const search = (q: string) => {
    ctl?.abort();
    active = -1;
    if ([...q.trim()].length < 2) { hits = []; status.textContent = ""; drawHits(); return; }
    ctl = new AbortController();
    status.textContent = m.searching;
    const sig = ctl.signal;
    fetch(`/api/places?q=${encodeURIComponent(q.trim())}&lang=${getLang()}`, { signal: sig })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as { results: Hit[] }; })
      .then((j) => { hits = j.results; status.textContent = hits.length ? m.found(hits.length) : m.noPlaceFound(q.trim()); drawHits(); })
      .catch((e: unknown) => { if ((e as Error).name === "AbortError") return; hits = []; status.textContent = m.searchUnavailable; drawHits(); });
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(() => search(input.value), 250); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); active = (active + 1) % hits.length; drawHits(); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; drawHits(); }
    else if (e.key === "Enter" && hits.length) { e.preventDefault(); choose(hits[Math.max(active, 0)]!.location); }
  });

  // saved locations and the places with sources
  const drawIdle = () => {
    clear(idle);
    const saved = S.prefs.locations;
    if (saved.length) idle.append(h("h3", {}, m.yourLocations), h("ul", { class: "saved-locs" }, saved.map((s) => {
      const label = h("input", { type: "text", value: s.label ?? "", maxlength: 40, placeholder: m.labelPlaceholder, "aria-label": m.labelFor(tx(s.location.name)) }) as HTMLInputElement;
      label.addEventListener("change", () => updateEntry(s.location.id, { label: label.value.trim() || undefined }));
      return h("li", { class: s.location.id === S.current?.id ? "on" : "" },
        h("button", { type: "button", class: "loc-pick", onclick: () => choose(s.location), "aria-current": s.location.id === S.current?.id ? "true" : null },
          h("strong", {}, tx(s.location.name)), h("span", { class: "muted small" }, placeLine(s.location))),
        label,
        h("button", { type: "button", class: "btn-icon small", "aria-label": m.removeLocation(tx(s.location.name)), onclick: () => { removeLocation(s.location.id); drawIdle(); } }, icon("close", "ic ic-s")),
      );
    })));
    idle.append(h("h3", {}, m.withSources), h("ul", { class: "featured" }, h("li", { class: "muted small" }, m.loading)));
    fetch(`/api/places?q=&lang=${getLang()}`).then((r) => r.json() as Promise<{ results: Hit[] }>).then((j) => {
      const ul = idle.querySelector(".featured");
      if (!ul) return;
      clear(ul);
      ul.append(...j.results.map((hit) => h("li", {}, h("button", { type: "button", class: "loc-pick", onclick: () => choose(hit.location) },
        h("strong", {}, tx(hit.location.name)), h("span", { class: "muted small" }, placeLine(hit.location))), coverageBadge(hit.coverage.level))));
      ul.append(h("li", { class: "muted small" }, m.alsoCountries));
    }).catch(() => { const ul = idle.querySelector(".featured"); if (ul) { clear(ul); ul.append(h("li", { class: "muted small" }, m.searchUnavailable)); } });
  };
  drawIdle();

  modal("dlg-locations", m.locationsTitle, (c) => {
    close = c;
    return [
      h("label", { class: "field" }, h("span", {}, m.findAPlace), h("div", { class: "search" }, icon("search"), input)),
      h("p", { id: "loc-hint", class: "muted small" }, m.locHint),
      status, list, idle,
      h("p", { class: "muted small attrib" }, m.geoAttribution),
    ];
  }, { onClose: rerender });
  input.focus();
}

/** Neighbourhoods (where we have a profile) and streets for the location being viewed. */
export function openPlaces(): void {
  const m = M();
  const loc = S.current;
  if (!loc) return openLocations();
  if (!savedEntry(loc.id)) saveLocation(loc);
  const locality = localityFor(loc.geonameId);
  const render = (box: HTMLElement, filter: string) => {
    clear(box);
    if (!locality) return;
    const e = savedEntry(loc.id)!;
    const list = locality.places.filter((p) => !filter || Object.values(p.name).some((n) => fold(n).includes(fold(filter))) || p.aliases.some((a) => fold(a).includes(fold(filter))));
    box.append(h("fieldset", { class: "places" }, h("legend", { class: "sr" }, m.neighbourhoods),
      list.length ? list.map((p) => {
        const on = e.placeIds.includes(p.id);
        return h("label", { class: `place${on ? " on" : ""}` },
          h("input", { type: "checkbox", checked: on, onchange: () => { updateEntry(loc.id, { placeIds: on ? e.placeIds.filter((x) => x !== p.id) : [...e.placeIds, p.id] }); render(box, filter); } }),
          h("span", {}, tx(p.name)), h("span", { class: "muted" }, m.placeKind[p.kind]));
      }) : h("p", { class: "muted" }, m.noNeighbourhood)));
  };
  modal("dlg-places", m.myPlacesIn(tx(loc.name)), () => {
    const box = h("div");
    const find = h("input", { type: "search", id: "place-find", placeholder: m.findNeighbourhood, autocomplete: "off" }) as HTMLInputElement;
    find.addEventListener("input", () => render(box, find.value));
    render(box, "");
    const term = h("input", { type: "text", id: "term", maxlength: 60, placeholder: m.streetPlaceholder, autocomplete: "off" }) as HTMLInputElement;
    const terms = h("ul", { class: "terms" });
    const drawTerms = () => {
      clear(terms);
      for (const x of savedEntry(loc.id)?.terms ?? []) terms.append(h("li", {}, x, h("button", { type: "button", class: "btn-icon small", "aria-label": m.removeTerm(x), onclick: () => { updateEntry(loc.id, { terms: (savedEntry(loc.id)?.terms ?? []).filter((y) => y !== x) }); drawTerms(); } }, icon("close", "ic ic-s"))));
    };
    drawTerms();
    const add = (e: Event) => {
      e.preventDefault();
      const v = term.value.trim();
      if ([...v].length < 3) { term.setCustomValidity(m.atLeast3); term.reportValidity(); return; }
      term.setCustomValidity("");
      const cur = savedEntry(loc.id)?.terms ?? [];
      if (!cur.some((x) => fold(x) === fold(v))) updateEntry(loc.id, { terms: [...cur, v] });
      term.value = "";
      drawTerms();
    };
    term.addEventListener("input", () => term.setCustomValidity(""));
    return [
      locality ? h("label", { class: "field" }, h("span", {}, m.neighbourhoods), find) : h("p", { class: "muted small" }, m.noLocality),
      locality ? box : null,
      h("form", { class: "field", onsubmit: add },
        h("label", { for: "term" }, m.streetLabel),
        h("div", { class: "row" }, term, h("button", { type: "submit", class: "btn" }, icon("plus", "ic ic-s"), m.add)),
        h("p", { class: "muted small" }, m.streetHint),
      ),
      terms,
      h("p", { class: "muted small" }, m.storedLocally),
    ];
  }, { onClose: rerender });
}

export function openPrefs(): void {
  const m = M();
  modal("dlg-prefs", m.preferences, (close) => [
    h("fieldset", { class: "field" }, h("legend", {}, m.language),
      h("div", { class: "seg" }, (Object.keys(LANGS) as Lang[]).map((l) => h("button", { type: "button", "aria-pressed": getLang() === l ? "true" : "false", lang: l, onclick: () => { setLang(l); update({ lang: l }); close(); openPrefs(); } }, LANGS[l].label))),
      h("p", { class: "muted small" }, m.languageNote)),
    h("fieldset", { class: "field" }, h("legend", {}, m.followedCategories),
      h("p", { class: "muted small" }, m.followedHint),
      h("div", { class: "checks" }, CATEGORIES.map((c) => {
        const on = S.prefs.categories.includes(c);
        return h("label", { class: "check" }, h("input", { type: "checkbox", checked: on, onchange: () => update({ categories: on ? S.prefs.categories.filter((x) => x !== c) : [...S.prefs.categories, c] }) }), icon(c, "ic ic-s"), m.cat[c]);
      }))),
    h("fieldset", { class: "field" }, h("legend", {}, m.notifications), h("p", { class: "muted small" }, m.notificationsNote)),
    h("fieldset", { class: "field" }, h("legend", {}, m.yourData),
      h("p", { class: "muted small" }, m.yourDataNote),
      h("button", { type: "button", class: "btn danger", onclick: (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = m.deleteConfirm; return; }
        wipe(); location.hash = "#/"; location.reload();
      } }, m.deleteAll)),
  ], { onClose: rerender });
}
