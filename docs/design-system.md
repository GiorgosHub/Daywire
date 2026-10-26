# DAYWIRE design system

DAYWIRE shows a city's day from its official sources. The design has one job: let you see in a few seconds what is
disrupted today, and trust it. Every moving thing on the page is real data or answers something you did. Nothing is
there to fill space.

**The night and the paper.** The hero is the city at night, drawn live. The page you read is a paper sheet laid over
it. Lime marks "now" and focus, and nothing else.

## Tokens

All tokens are CSS custom properties: `src/styles/tokens.css` for the base and `src/styles/shell.css` `:root` for the
night/motion layer.

### Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Night | `--navy-950` / `--navy-900` | #070F1C / #0C1A2E | hero, ticker, footer, compact bar |
| Paper | `--paper` / `--surface` | #F5F1E8 / #FFFDF8 | the sheet, cards, panels |
| Ink | `--ink` / `--slate` / `--muted` | #152030 / #384657 / #5A6676 | text on paper, from strong to quiet |
| Now | `--lime` | #C8F04B | the current time, the live pulse, focus on the night |
| Status | `--st-{active,upcoming,ended,stale}-{ink,bg,mark}` | — | status chips and marks only, always with words |
| Severity | `--sev-{yellow,orange,red}-{ink,bg,mark}` | — | the issuer's own level, never our own |
| Data on night | `--sevN-on-dark`, `--{water,roads,transport,power}-on-dark`, `--now-on-dark`, `--next-on-dark` | — | bars, dots and lights over the city |
| Light on night | `--night-veil`, `--night-veil-2`, `--night-veil-3`, `--lime-glow`, `--glass`, `--glass-line` | — | lines, glass panels, glows |

`hero.ts` (`SEV`, `CAT`) mirrors the on-dark data colours for the WebGL lights. Change both together.

### Type

There is one family: **Inter, variable, weights 100–900** (`/fonts/Inter-var.woff2`, OFL). It is the same file used on
teleia and Giannotas.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Headline | clamp(46px, 7.4vw, 108px) / 0.94 | 780; second line 300 | tracking −0.045em; the weight animates on switch-on |
| Readout numbers | clamp(40px, 4.6vw, 60px) | 700 | tabular figures |
| Section heads | 21px | 700 | sentence case |
| Card titles | 18px | 600 | |
| Body | 16px / 1.5 | 400 | lines under 80 characters |
| Small print, meta | 12–14px | 400–600 | tabular figures for times |

There are no all-caps labels. Headings and labels are sentence case.

### Space, shape, depth

- **Space:** a 4/8 rhythm. The gutter (`--gut`) is 16 → 28 → 40px. The wrap is 1200px.
- **Radii:** `--r-s` 6 for buttons and fields, `--r` 10 for cards, `--r-l` 14 for panels, 22 for the glass wire, 28 for
  the sheet's edge. A larger radius means a larger, more ambient surface.
- **Depth:** on paper, a hairline border plus `--shadow`. On the night, glass (`--glass` with blur) and glow.

### Motion

| Token | Value | For |
|---|---|---|
| `--ease-out` | cubic-bezier(.16,1,.3,1) | things that arrive and settle |
| `--ease-io` | cubic-bezier(.65,0,.35,1) | things that travel (scan, circle, draw) |
| `--t-fast` / `--t` | 120 / 200ms | hover and press feedback |
| entrances | 800–1100ms | one orchestrated arrival, staggered by `--i` |

## Motion inventory

Each motion says something true. With *reduce motion*, every one of them is off and the page is complete and still.

| Motion | What it means | Where | Inspired by |
|---|---|---|---|
| **Switch-on** | A scanner crosses the dark city and the streets light behind it. Today's notices then come on one by one, and the headline goes from thin to full weight. | `cityfield.ts` `boot()`, `.title` `ignite` | Giannotas' sign and x-ray scan |
| City lights | Each light is a notice in force or due today, in its severity or category colour. With none, there are no lights. | `cityfield.ts` | — |
| Daylight | The field's light follows the real sun at that place; the wire shades sunrise to sunset. | `sun.ts`, `wire.ts` | — |
| **The wire (ticker)** | Today's notices, running like an agency wire. Every item is a link; it pauses on hover and focus. | `ticker.ts` | teleia's marquee |
| **Pinned city** | The city holds while the paper slides over it, dimming and leaning back (`--p`). | `main.ts` `measure/onScroll` | teleia's pinned scenes |
| Compact bar | Takes over once the city is covered. It hides while you scroll down and returns on the way up. | `main.ts`, `.compact` | Giannotas' header |
| **Live strip** | On a notice in force with a stated start and end, it shows how much of that time has passed, up to now. It fills from the start the first time you see it. | `card.ts` `liveStrip` | — |
| **Rail** | The page's sections as stops on a wire (≥1360px). A pulse sits at your reading position, and each stop is a button. | `rail.ts` | teleia's travelling full stop |
| Now line | "Now" on today's 24-hour wire. | `wire.ts` | — |
| Circle swap | A new place opens from where you clicked (View Transitions). | `motion.ts` `circleSwap` | — |
| Detail from card | The notice opens out of the card you clicked. | `dialogs.ts` `modal({from})` | — |
| Counters | Numbers count from what you last saw to what is true now. | `motion.ts` `countTo` | — |
| Save sparks | Confirms that a notice was saved. | `motion.ts` `burst` | — |

## Components

| Component | Variants | States | Accessibility |
|---|---|---|---|
| Card (`.card`) | by status class (`st-*`), severity (`sev-r1..4`), `prio`, `unverified` (dashed) | default, hover (light follows the pointer), saved | title link covers the card; the status is in words; the strip is `aria-hidden` (the words "ends in" carry it) |
| Ticker (`.ticker`) | moving, `quiet` (nothing today: static text), none (no coverage) | paused on hover/focus | `section` with a label; the looping copies are `aria-hidden` and out of the tab order |
| Rail (`.rail`) | wide screens only | stop `on` / `past`; label on hover or focus | `nav` with a label; the stops are buttons |
| Wire (`.wire`) | rows, empty, loading (scan), local time only (no coverage) | row hover lights its notice's lights | real links; the time axis is `aria-hidden` |
| Coverage ring | 8 segments by category state | connected / link-only / needs-config / none | the list beside it carries the same facts in words |

## Rules

| ✅ Do | ❌ Don't |
|---|---|
| Animate what is real: times, counts, notices, the sun | Add lights, items or numbers to make a quiet place look busy |
| Say "abstract city, not a map" wherever the field shows | Present the field as a map or as live conditions |
| Keep severity in the issuer's words and colours | Rank or recolour official warnings ourselves |
| Give every motion a reduced-motion state that is complete | Hide content behind an animation that may not run |
| Use one type family; let weight and size do the work | Put all-caps labels over every heading |

## Audit (October 2026)

- **Coverage:** most surfaces use the colour tokens. The on-dark data colours and the repeated night alphas moved into
  tokens in this pass. About 58 literal `rgb()` values remain in `shell.css`, mostly one-off gradients and glows in the
  hero.
- **Gaps:** the WebGL colours are duplicated in `hero.ts`. Dark mode is not designed; the night is the only dark
  surface.
- **Next:**
  1. Read the field colours from the CSS tokens at runtime.
  2. Collapse the paper-side radii into three steps.
  3. Fold the remaining hero gradients into named tokens.
