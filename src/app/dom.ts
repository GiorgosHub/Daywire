// Tiny DOM helpers. Source text is only ever set as text (textContent), never parsed as HTML.
type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

// Icons: 24×24 strokes, drawn here (trusted, static).
const PATHS: Record<string, string> = {
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z M21 21l-5.2-5.2",
  bookmark: "M6.5 3.5h11v17l-5.5-4-5.5 4z",
  sliders: "M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 4.5v5 M10 14.5v5",
  close: "M6 6l12 12 M18 6L6 18",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14 M5 12h14",
  water: "M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z",
  power: "M13 2.5L5 13.5h6l-1 8 8-11h-6z",
  roads: "M7 21L10.5 3 M17 21L13.5 3 M12 6v2 M12 11v2.5 M12 17v3",
  transport: "M6 16.5V6a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 18 6v10.5 M6 11.5h12 M8 16.5h8 M8 20v-3.5 M16 20v-3.5",
  weather: "M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .3 6.5 M12.5 13l-2 4h3l-2 4",
  services: "M4 9.5l1.5-5h13l1.5 5 M4 9.5h16 M5.5 9.5V20h13V9.5 M10 20v-5h4v5",
  emergency: "M12 3l8 3v5.5c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6z M12 8v5 M12 16v.5",
  announcement: "M4 10v4h3l7 4V6l-7 4z M17.5 9a4 4 0 0 1 0 6",
  alert: "M12 4l9 16H3z M12 10v4.5 M12 17.2v.3",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  phone: "M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  dot: "M12 12m-3.5 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0",
};

export function icon(name: keyof typeof PATHS | string, cls = "ic"): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", PATHS[name] ?? PATHS.dot!);
  svg.appendChild(p);
  return svg;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
