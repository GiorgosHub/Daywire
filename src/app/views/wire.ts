// "Today's wire": the location's day from 00:00 to 24:00 in its own time zone, with every notice that applies today
// drawn at its real hours. Built only from records; with no records for today it says so. Each bar links to the notice.
import { dayBounds } from "../../domain/time.ts";
import type { Row } from "../../domain/view.ts";
import { h } from "../dom.ts";
import { clock, dayLabel, localDay, M, tx, viewerTz, zoneName } from "../i18n/index.ts";
import { statusText } from "./status-ui.ts";

export function wire(all: Row[], now: number, tz: string): HTMLElement {
  const m = M();
  const [d0, d1] = dayBounds(localDay(now, tz), tz);
  const span = d1 - d0;
  const today = all
    .filter((r) => r.n.category !== "announcement" && r.st.state !== "archived" && r.st.state !== "stale")
    .map((r) => {
      const ongoing = r.st.state === "open_ended" || (r.st.state === "active" && r.n.currentWhileListed);
      const s = r.st.startMs ?? (ongoing ? d0 : undefined);
      const e = r.st.endMs ?? (ongoing ? d1 : undefined);
      return { r, s, e, open: r.st.endMs === undefined };
    })
    .filter((x): x is { r: Row; s: number; e: number; open: boolean } => x.s !== undefined && x.e !== undefined && x.s < d1 && x.e > d0 && x.e - x.s >= 60_000)
    .sort((a, b) => Number(b.r.priority) - Number(a.r.priority) || a.s - b.s)
    .slice(0, 6);

  const pct = (ms: number) => `${(((Math.min(Math.max(ms, d0), d1) - d0) / span) * 100).toFixed(2)}%`;
  const nowPct = pct(now);
  const hm = (ms: number) => clock(ms, tz).split(" ")[0]!;
  const ticks = [0, 6, 12, 18, 24].map((hh) => h("span", { class: hh === 24 ? "tick end" : "tick", style: `left:${(hh / 24) * 100}%` }, `${String(hh).padStart(2, "0")}:00`));

  return h("section", { class: "wire", "aria-labelledby": "wire-h" },
    h("div", { class: "wire-head" },
      h("h2", { id: "wire-h" }, m.today, h("span", { class: "wire-date" }, ` · ${dayLabel(now, tz)}`)),
      h("span", { class: "wire-now" }, `${m.now} `, h("strong", {}, hm(now)), tz !== viewerTz() ? h("span", { class: "wire-zone" }, ` ${zoneName(now, tz)}`) : null),
    ),
    today.length
      ? h("ol", { class: "wire-rows" },
          today.map(({ r, s, e, open }) => {
            const st = statusText(r.n, r.st, now);
            const time = open ? m.wireOpen(s <= d0 ? null : hm(s)) : `${s < d0 ? "…" : hm(s)}–${e > d1 ? "…" : hm(e)}`;
            const sev = r.n.severity ? ` sev-r${r.n.severity.rank}` : "";
            return h("li", { class: `wire-row cat-${r.n.category} ${st.cls}${sev}` },
              h("a", { href: `#/n/${encodeURIComponent(r.n.id)}`, class: "wire-label" }, h("span", { class: "wl-t" }, tx(r.n.headline)), h("span", { class: "wl-time" }, time)),
              h("div", { class: "wire-track", "aria-hidden": "true" },
                h("span", { class: `wire-bar${open ? " open" : ""}`, style: `left:${pct(s)};width:calc(${pct(e)} - ${pct(s)})` }),
                h("span", { class: "wire-nowtick", style: `left:${nowPct}` })),
            );
          }))
      : h("p", { class: "wire-empty" }, m.wireEmpty),
    h("div", { class: "wire-axis", "aria-hidden": "true" }, ticks),
  );
}
