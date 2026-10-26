// "Today's wire": the day from 00:00 to 24:00 in Larissa, with every notice that applies today drawn at its real
// hours. Built only from records; with no records for today it says so. Each bar is a link to the notice.
import { dayBounds } from "../../domain/time.ts";
import type { Row } from "../../domain/view.ts";
import { h } from "../dom.ts";
import { clock, dayLabel, localDay, t, tx } from "../i18n.ts";
import { statusText } from "./status-ui.ts";

const TZ = "Europe/Athens";

export function wire(all: Row[], now: number): HTMLElement {
  const [d0, d1] = dayBounds(localDay(now), TZ);
  const span = d1 - d0;
  const today = all
    .filter((r) => r.n.category !== "announcement" && r.st.state !== "archived" && r.st.state !== "stale")
    .map((r) => {
      const s = r.st.startMs ?? (r.st.state === "open_ended" ? d0 : undefined);
      const e = r.st.endMs ?? (r.st.state === "open_ended" ? d1 : undefined);
      return { r, s, e, open: r.st.endMs === undefined };
    })
    .filter((x): x is { r: Row; s: number; e: number; open: boolean } => x.s !== undefined && x.e !== undefined && x.s < d1 && x.e > d0)
    .sort((a, b) => Number(b.r.priority) - Number(a.r.priority) || a.s - b.s)
    .slice(0, 6);

  const pct = (ms: number) => `${(((Math.min(Math.max(ms, d0), d1) - d0) / span) * 100).toFixed(2)}%`;
  const nowPct = pct(now);

  const ticks = [0, 6, 12, 18, 24].map((hh) => h("span", { class: hh === 24 ? "tick end" : "tick", style: `left:${(hh / 24) * 100}%` }, `${String(hh).padStart(2, "0")}:00`));

  return h("section", { class: "wire", "aria-labelledby": "wire-h" },
    h("div", { class: "wire-head" },
      h("h2", { id: "wire-h" }, t("Σήμερα", "Today"), h("span", { class: "wire-date" }, ` · ${dayLabel(now)}`)),
      h("span", { class: "wire-now" }, t("Τώρα ", "Now "), h("strong", {}, clock(now))),
    ),
    today.length
      ? h("ol", { class: "wire-rows" },
          today.map(({ r, s, e, open }) => {
            const st = statusText(r.n, r.st, now);
            const label = tx(r.n.headline);
            const time = open ? t(`από ${s <= d0 ? "πριν από σήμερα" : clock(s)}, χωρίς λήξη`, `from ${s <= d0 ? "before today" : clock(s)}, no end`) : `${s < d0 ? "…" : clock(s)}–${e > d1 ? "…" : clock(e)}`;
            return h("li", { class: `wire-row cat-${r.n.category} ${st.cls}${r.n.severity ? ` sev-${r.n.severity.level}` : ""}` },
              h("a", { href: `#/n/${encodeURIComponent(r.n.id)}`, class: "wire-label" }, h("span", { class: "wl-t" }, label), h("span", { class: "wl-time" }, time)),
              h("div", { class: "wire-track", "aria-hidden": "true" },
                h("span", { class: `wire-bar${open ? " open" : ""}`, style: `left:${pct(s)};width:calc(${pct(e)} - ${pct(s)})` }),
                h("span", { class: "wire-nowtick", style: `left:${nowPct}` })),
            );
          }))
      : h("p", { class: "wire-empty" }, t("Καμία καταχωρημένη διακοπή ή προειδοποίηση για σήμερα από τις συνδεδεμένες πηγές.", "No interruptions or warnings recorded for today by the connected sources.")),
    h("div", { class: "wire-axis", "aria-hidden": "true" }, ticks, h("span", { class: "wire-nowline", style: `left:${nowPct}` })),
  );
}
