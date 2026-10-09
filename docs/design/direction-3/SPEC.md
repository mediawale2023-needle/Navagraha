# Direction 3 — Contemporary Vedic: design specification

This is the approved design for Navagraha's consumer app. The source of truth is the six mockups
in [`mockups/`](mockups) (extracted verbatim from the approved "Navagraha Redesign Directions"
canvas, version `1791530006-8131`) and their renders in [`reference/`](reference). Every value
below is read from those files; nothing here is invented. Where a screen was not mocked up, it is
built from these values and components only.

Render the references again with `node scripts/design/render-reference.mjs`. Compare an implemented
screen with `node scripts/design/compare.mjs` (see the script header).

## Colour

All values are the existing Navagraha palette or tints of it. Tokens live in `client/src/index.css`.

| Token | Value | Used for (in the mockups) |
|---|---|---|
| `--ground` | `#fbf1dc` | Page background |
| `--surface` | `#fffaf0` | Cards, inputs, chart paper, evidence items |
| `--sunken` | `#f3eada` | Progress-bar track |
| `--highlight` | `#f6ead0` | Lagna diamond, today's house in Gochara, alternate dasha segments |
| `--line` | `#e5d29a` | Card borders, dividers, outline buttons |
| `--hairline` | `#efe2bf` | Dividers inside a card (Gochara cells, answer header and footer, evidence items) |
| `--frame` | `#b6791e` | Chart double frame, border of an exalted or own-sign graha card |
| `--ink` | `#1a1a2e` | Text; navy header band; filled chips; dark buttons; composer border |
| `--ink-muted` | `#6b5a33` | Secondary text, labels, Devanagari glosses on cream |
| `--amber` | `#e9a84d` | Wordmark, active-nav underline, Ask button, current period, today's nakshatra |
| `--amber-text` | `#8a5a12` | Amber-family text on cream: Lagna label, verdict word, link hover |
| `--on-navy` | `#fbf1dc` | Primary text on the navy band |
| `--on-navy-2` | `#e8dcc0` | Inactive nav links, Devanagari wordmark, secondary text on navy |
| `--on-navy-3` | `#c9bd9f` | Labels and captions on navy |
| `--navy-line` | `#3a3a52` | Dividers on navy, bottom-bar top border |
| `--navy-control` | `#4a4a66` | Pill and input borders on navy, nakshatra ring strokes |
| `--positive` | `#0c7f4d` | "For" in evidence |
| `--negative` | `#8b1a1a` | "Against" in evidence |

Contrast (WCAG): ink on ground 15.2:1; ink-muted on ground 6.0:1; amber-text on ground 5.3:1; ink
on amber 8.3:1; on-navy-3 on ink 9.2:1. Amber is never used as text on cream (1.8:1).

## Typography

Families, loaded exactly as in the mockups:
`https://fonts.googleapis.com/css2?family=Eczar:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap`

- **Eczar** — every heading, the wordmark, large values, and all Devanagari.
- **DM Sans** (`'DM Sans', 'Noto Sans', sans-serif`) — everything else.

### Desktop (1440 × 1040)

| Role | Face, weight | Size / line height | Colour |
|---|---|---|---|
| Wordmark | Eczar 600 | 24px, Devanagari part 18px | amber; Devanagari on-navy-2 |
| Nav link | DM Sans 400 / active 600 | 15px | on-navy-2 / on-navy + 2px amber underline, 4px below |
| Account pill | DM Sans 400 | 14px | on-navy, 1px navy-control border |
| Date line (Today) | Eczar | 20px | amber |
| Hero title (Today) | Eczar 600 | 52px / 1.1 | on-navy |
| Page title (Kundli) | Eczar 600 | 34px, Devanagari 22px | ink, Devanagari ink-muted |
| Section title | Eczar 600 | 26px (Gochara, answer title), 24px (Vimshottari), 22px (cards), 20px (glossary) — each with a Devanagari gloss 4–9px smaller in ink-muted | ink |
| Panchang value | Eczar | 20px | on-navy |
| Large value | Eczar 600 | 26px | ink |
| Graha name | Eczar 600 | 20px, English name DM Sans 14px | ink, English ink-muted |
| Chart caption | Eczar | 18px | ink-muted |
| Lead (answer text) | DM Sans | 17px | ink |
| Body | DM Sans | 16px / 1.55 (Ask 1.6) | ink |
| Small | DM Sans | 14px | ink or ink-muted |
| Caption | DM Sans | 13px | ink-muted / on-navy-3 |
| Micro (cell labels) | DM Sans | 12px | ink-muted |

### Mobile (390 × 844)

| Role | Face, weight | Size / line height |
|---|---|---|
| Header title | Eczar 600 | 24px / 1.2 |
| Header date | Eczar | 16px, amber |
| Header sub | DM Sans | 13px, on-navy-3 |
| Section title | Eczar 600 | 20px, gloss 15px ink-muted |
| Card title | Eczar 600 | 19px; graha name 18px |
| Body | DM Sans | 15–16px / 1.5 (Ask 1.55) |
| Caption | DM Sans | 13px |
| Micro, bottom-bar label | DM Sans | 12px (active 600) |

Nothing in the interface is smaller than 12px. (Chart house numbers are 11 units in a 300-unit
viewBox drawn at 320–380px, so 12–14px on screen.)

## Layout

### Desktop
- Container: `max-width: 1240px`, horizontal padding `40px`. The mockups use content-box sizing, so with
  Tailwind's border-box the container is `max-w-[1320px] px-10` (1240px of content).
- **Navy band** (`--ink`) at the top of every page, holding the navigation: padding `18px 40px`,
  gap `32px`, links gap `26px`, account pill on the right (`8px 14px`, `min-height: 40px`, radius 999).
- **Today hero** (inside the band): padding `24px 40px 44px`; grid `7fr / 4fr`, gap `48px`, vertically
  centred; left column gap `18px`; Panchang strip is a 4-column `<dl>` with a 1px navy-line top border,
  cells padded `14px 16px 0` and separated by 1px navy-line left borders; nakshatra ring 260px with a
  13px legend below (gap 10px).
- **Main**: Today padding `40px 40px 56px`, section gap `36px`; Kundli padding `36px 40px 48px`, gap
  `32px`; Ask padding `32px 40px 0`.
- **Two-up cards** (Today): grid `1fr 1fr`, gap `28px`.
- **Kundli**: grid `5fr / 7fr`, gap `48px`, aligned to the top. Chart column centred, gap 14px.
  Graha grid 3 columns, gap `10px`. Vimshottari bar full width below.
- **Ask**: conversation column `flex: 999 1 560px; max-width: 760px`, gap `22px`; glossary aside
  `flex: 1 1 280px; max-width: 340px`, gap `12px`; column gap `40px`; composer sticky at the bottom
  (`padding: 12px 0 26px`).

### Mobile
- Width 390. No top navigation bar: each screen opens with a **navy header** (Today: `18px 20px 20px`
  with the Panchang summary and a 96px ring; Kundli: `16px 20px 14px`; Ask: `12px`, back button 44×44).
- Content padding `16px` (Today, Ask) or `16px 20px` (Kundli); gap `14px`.
- **Bottom bar**: navy, 1px navy-line top border, 4 equal columns — Today, Kundli, Ask, Dasha —
  padding `6px 4px 18px`; each item `min-height: 48px`, icon 22px, label 12px, gap 3px; active
  item amber and 600, others on-navy-2.
- Bottom sheet (Ask term detail): surface, radius `18px 18px 0 0`, shadow `0 -8px 24px rgba(26,26,46,0.08)`,
  4px × 40px handle in `--line`.
- Ask composer docked above the bottom edge (`10px 12px 24px`, 1px line top border).

## Shape

| Radius | Where |
|---|---|
| 4px | Mobile Gochara chips |
| 6px | Gochara chips |
| 8px | Dasha bar, segmented buttons, Ask submit button |
| 10px | Graha cards, inputs on navy, evidence items, mobile Gochara grid, mobile graha cards |
| 12px | Section cards, Gochara strip, composer, mobile dasha card |
| 14px | Answer card; message bubble `14px 14px 4px 14px` |
| 18px | Mobile bottom sheet (top corners) |
| 999px | Pills (account) |

Borders: 1px `--line` by default; 1px `--hairline` inside cards; 1.5px `--frame` for an emphasised
graha card; 1.5px `--ink` for the composer and for "demanding" chips; the chart frame is 1px `--frame`,
8px padding, then a 3px double `--frame` border with 10px padding (mobile 5px / 6px).

Elevation: none, except the mobile bottom sheet. No gradients, no glass.

## Components

- **Filled chip** (supportive): `--ink` background, `--on-navy` text, 13px, padding `2px 6px`, radius 6.
- **Outlined chip** (demanding): 1.5px `--ink` border, padding `1px 5px`, radius 6. Supportive and
  demanding are told apart by fill, not by colour.
- **Primary action**: `--amber` background, `--ink` text, 600, padding `0 18px`, `min-height: 44px`, radius 8.
- **Dark toggle (pressed)**: `--ink` background, `--on-navy` text, padding `8px 14px`, `min-height: 40px`, radius 8.
- **Outline toggle**: transparent, 1px `--line`, padding `8px 14px`, radius 8.
- **Input on navy**: 1px `--navy-control`, radius 10, padding `5px 5px 5px 14px`, button inside.
- **Composer on cream**: `--surface`, 1.5px `--ink`, radius 12, padding `6px 6px 6px 16px`.
- **Section card**: `--surface`, 1px `--line`, radius 12, padding 22px, gap 12px.
- **Graha card**: `--surface`, 1px `--line` (1.5px `--frame` when exalted or own sign; `--ink`
  background with amber name when it is the Mahadasha lord), radius 10, padding `12px 14px`, gap 2px.
- **Evidence item**: 1px `--hairline`, radius 10, padding `10px 12px`; "For" 600 `--positive`,
  "Against" 600 `--negative`, source line `--ink-muted`.
- **Answer card**: `--surface`, 1px `--line`, radius 14; header `18px 22px` with hairline bottom; body
  `18px 22px`, gap 14px; footer `12px 22px` with hairline top and 14px links.
- **Glossary entry**: Eczar 600 17px term, Devanagari in `--ink-muted`, 14px definition, 1px `--line`
  bottom border, padding-bottom 10px.
- **Progress track**: 10px high (mobile 8px), radius 5 (4), `--amber` fill on `--sunken`.
- **Icons**: inline stroke SVG, 22px, 1.6px stroke (1.2px for the inner chart lines): Today (sun
  ring), Kundli (North Indian chart square), Ask (speech bubble), Dasha (bars). No emoji, no images.

## Astrology visualisations

- **North Indian chart**: 300-unit viewBox; 1.2px `--ink` square on `--surface`; diagonals and inner
  diamond 1px `--ink`; the Lagna diamond filled `--highlight`; house sign numbers DM Sans 11 in
  `--ink-muted`; planet abbreviations Eczar 600 (15 units desktop, 17 mobile) in `--ink`; the Lagna
  label in `--amber-text`. Labels in Devanagari by default, with Devanagari / English / South Indian
  toggles. Desktop 380px, mobile 320px. A retrograde planet carries ℞, drawn so it cannot overlap
  the abbreviation (the mockup's "श℞" glyph collision is the one deliberate correction).
- **Nakshatra ring**: 240-unit viewBox; circles r=112 and r=86 and 27 ticks in `--navy-control`;
  today's nakshatra segment filled `--amber`; the birth nakshatra outlined 2px `--amber`; inner circle
  r=44 and diamond in `--navy-line`; centre "27 / nakshatras". 260px on desktop, 96px on mobile
  (no ticks, 2px rings).
- **Gochara strip**: 12 columns (mobile 4 × 3), one per house from the natal Moon, labelled
  `n · Sign`; `--surface`, 1px `--line` outside and `--hairline` between cells, radius 12 (mobile 10);
  the Moon's current house shaded `--highlight`; planets as filled or outlined chips.
- **Vimshottari to scale**: 44px bar, 1px `--ink` border, radius 8, each Mahadasha a segment sized by
  its years, alternating `--highlight` / `--surface`, the current one `--amber` and 600, a 2px `--ink`
  "today" marker; 13px labels; start, now and end dates beneath.

## Behaviour and content rules

- Every astrological value comes from the engine for the user's chart. Where a value is unavailable
  (no chart, approximate birth time, AI offline) the slot shows the existing honest state; the design
  never shows sample data.
- Terms: "Ask your Kundli" everywhere. Devanagari accompanies, never replaces, the English term.
- Touch targets ≥ 44px; real `<button>`, `<a>`, `<input>` with labels.
- Breakpoints (derived — the mockups define only 1440 and 390): ≥ 1024px desktop layout;
  768–1023px the desktop layout (navy band) with its columns stacked; ≤ 767px the mobile layout with
  navy page headers and the bottom bar. 768 is Tailwind's `md`, which every page already switches on.
