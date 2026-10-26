// How each status reads on screen. Text always carries the meaning; colour and icon only reinforce it.
import type { Status } from "../../domain/status.ts";
import type { Notice } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { dayClock, M, relative, tx } from "../i18n/index.ts";

export function statusText(n: Notice, st: Status, now: number): { label: string; detail?: string; cls: string } {
  const m = M();
  switch (st.state) {
    case "active":
      return {
        label: n.category === "weather" || n.currentWhileListed ? m.stInForce : m.stHappening,
        ...(st.endMs ? { detail: m.endsIn(relative(st.endMs, now)) } : n.currentWhileListed ? { detail: m.listedNow } : {}),
        cls: "st-active",
      };
    case "upcoming":
      return { label: m.stUpcoming, ...(st.startMs ? { detail: m.startsIn(relative(st.startMs, now)) } : {}), cls: "st-upcoming" };
    case "open_ended":
      return { label: m.stOpen, detail: m.noEndAnnounced, cls: "st-open" };
    case "ended":
      return { label: m.stEnded, ...(st.endMs ? { detail: dayClock(st.endMs, n.tz) } : {}), cls: "st-ended" };
    case "expired":
      return { label: m.stExpired, ...(st.endMs ? { detail: dayClock(st.endMs, n.tz) } : {}), cls: "st-ended" };
    case "stale":
      return { label: m.stStale, detail: n.currentWhileListed ? m.staleListed : m.staleOld, cls: "st-stale" };
    case "archived":
      return { label: m.stArchived, cls: "st-ended" };
    default:
      return { label: m.stInfo, cls: "st-info" };
  }
}

export function statusChip(r: Row, now: number): HTMLElement {
  const s = statusText(r.n, r.st, now);
  return h("span", { class: `chip ${s.cls}` }, h("span", { class: "chip-mark", "aria-hidden": "true" }), s.label);
}

/** The source's own severity words, with a visual rank (1–4) that only reinforces them. */
export function severityChip(n: Notice): HTMLElement | null {
  const s = n.severity;
  if (!s) return null;
  const cls = s.scheme === "meteoalarm" ? `sev-${s.code}` : `sev-r${s.rank}`;
  return h("span", { class: `chip sev ${cls}`, title: M().severityBy(tx(n.publisher)) }, icon("alert", "ic ic-s"), tx(s.label));
}

export function statusExplain(n: Notice, st: Status): string {
  const m = M();
  switch (st.state) {
    case "active":
      return n.currentWhileListed ? m.exActiveListed : n.endKind === "validity" ? m.exActiveWarning : m.exActiveEvent;
    case "upcoming": return m.exUpcoming;
    case "open_ended": return m.exOpen;
    case "ended": return m.exEnded;
    case "expired": return m.exExpired;
    case "stale": return n.currentWhileListed ? m.exStaleListed : m.exStale;
    case "archived": return m.exArchived;
    default: return m.exInfo;
  }
}
