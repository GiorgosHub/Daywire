// The wire: a news-agency ticker of this place's notices for today, running along the edge where the city meets the
// page. Every item is a real notice and a link to it; nothing is added to fill the band. Hovering or focusing it
// pauses it. With reduced motion it is a still row that scrolls sideways by hand. With nothing for today it says so,
// in the same words as today's wire, and does not move.
import type { Row } from "../../domain/view.ts";
import { h } from "../dom.ts";
import { M, tx } from "../i18n/index.ts";
import { S } from "../state.ts";
import { fieldApi, signalsFrom } from "./hero.ts";
import { statusText } from "./status-ui.ts";

const css = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

export function ticker(all: Row[], now: number): HTMLElement | null {
  const f = S.feed;
  if (!f || f.coverage.level === "none" || f.location.id !== S.current?.id) return null;
  const m = M();
  const sig = new Map(signalsFrom(all, now).map((s) => [s.id, s]));
  const today = all.filter((r) => sig.has(r.n.id));
  if (!today.length) return h("section", { class: "ticker quiet", "aria-label": m.tickerLabel }, h("p", { class: "tk-quiet wrap" }, m.wireEmpty));

  const field = fieldApi();
  const item = (r: Row, copy: boolean) => {
    const st = statusText(r.n, r.st, now);
    return h("li", { class: "tk-item" },
      h("a", {
        href: `#/n/${encodeURIComponent(r.n.id)}`, tabindex: copy ? "-1" : null,
        onpointerenter: () => field?.highlight(r.n.id), onpointerleave: () => field?.highlight(null),
        onfocus: () => field?.highlight(r.n.id), onblur: () => field?.highlight(null),
      },
        h("span", { class: "tk-dot", style: `--c:${css(sig.get(r.n.id)!.color)}`, "aria-hidden": "true" }),
        h("span", { class: "tk-pub" }, tx(r.n.publisher)),
        h("span", { class: "tk-head" }, tx(r.n.headline)),
        st.detail ? h("span", { class: "tk-when" }, st.detail) : null));
  };
  // the list once for reading, then copies (hidden from assistive tech) so the band loops without a gap
  const copies = today.length < 4 ? 3 : 1;
  const track = h("ul", { class: "tk-track", style: `--dur:${Math.max(28, today.length * (copies + 1) * 9)}s` },
    today.map((r) => item(r, false)),
    Array.from({ length: copies }, () => today.map((r) => { const li = item(r, true); li.setAttribute("aria-hidden", "true"); return li; })));
  return h("section", { class: "ticker", "aria-label": m.tickerLabel },
    h("p", { class: "tk-tag", "aria-hidden": "true" }, h("span", { class: "tk-live" }), m.tickerTag),
    h("div", { class: "tk-view" }, track));
}
