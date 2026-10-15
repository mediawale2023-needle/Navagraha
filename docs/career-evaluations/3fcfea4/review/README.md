# Career & Profession Report: independent astrological review

Three reports produced by the live evaluation of commit 3fcfea4 (gpt-4o, facts-first pipeline), for three **synthetic** test charts. None is a customer's. The reports were not edited.

## What is in this package

| Chart | Report as the customer sees it | Annotated report (fact vs AI) | Calculated chart data |
|---|---|---|---|
| Delhi, 1985-03-22 06:15 | [`../delhi.md`](../delhi.md) | [`delhi-report-annotated.md`](delhi-report-annotated.md) | [`delhi-chart.md`](delhi-chart.md) |
| Belagavi, 1991-11-13 12:30 | [`../belagavi.md`](../belagavi.md) | [`belagavi-report-annotated.md`](belagavi-report-annotated.md) | [`belagavi-chart.md`](belagavi-chart.md) |
| Mumbai, 2000-07-04 18:45 | [`../mumbai.md`](../mumbai.md) | [`mumbai-report-annotated.md`](mumbai-report-annotated.md) | [`mumbai-chart.md`](mumbai-chart.md) |

Each chart file gives the birth details, the D1 (placements, dignity, Neecha Bhanga, combustion, retrogression, houses, lords, Sarvashtakavarga), the D10, the 10th-house aspects, the engine's yogas, and the full Vimshottari timeline, with the Antardashas of every Mahadasha in the report's four-year window. It also lists the field and work-style assessments the report used. Machine-readable records, including every section attempt and the validators' findings, are in `../<chart>.json`. Regenerate this folder with `npx tsx scripts/career-review-package.ts`.

## How the report is made

- **[Chart fact]** sentences are written by the application from the calculation. They are not AI output: please check them against the chart file.
- **[AI]** text is gpt-4o's interpretation, printed after the fact it explains. It is checked automatically:
  - it may name only planets, signs, houses, years and yogas that its fact states;
  - it may not place a planet in a wrong house;
  - it may not call a planet strong without exalted, own-sign or Moolatrikona dignity;
  - it may not promise outcomes, call a running period upcoming, or recommend a weakly supported field;
  - it must not contradict the work-style conclusion.

  These checks cannot judge whether an interpretation is *sound*. That is what this review is for.
- **Conventions of the application, not classical rules.** Please judge whether they are reasonable:
  - the work-style rule (6th vs 7th house support and the business rating);
  - the six-field tally (traditional significators and houses);
  - the "supportive / mixed / demanding" tone of a period (from its lord's dignity, houses ruled and occupied, and D10 placement);
  - "best placed" and "most challenged" career planets (by dignity among the 10th lord, Lagna lord, D10 Lagna and 10th lords, and Sun and Saturn).
- **Engine settings:** Lahiri ayanamsa, mean node, whole-sign houses, Vimshottari. Shadbala is partial and is not used. D10 degrees are not calculated.
- **Birth-time sensitivity:** each chart file states how many minutes of birth time move the D10 Lagna. For Delhi it is 1 minute earlier and 7 minutes later.

## Review checklist

Score each item 1–5 (5 = no issue) for each report, and note any specific sentence by section and paragraph.

### A. Factual accuracy
- A1. Chart facts (planets, signs, houses, dignities, lords, D10, yogas, dates) match the chart file.
- A2. AI text states no placement, house, aspect, dignity, yoga or date that the chart does not support.
- A3. Strength and weakness are described in proportion to the dignity: nothing debilitated or neutral is presented as strong, and a cancelled debilitation is not presented as exaltation.
- A4. Statements about the D10 are about the D10, and statements about the birth chart are about the D1.

### B. Interpretive reasoning
- B1. Each interpretation follows recognisably from its fact by standard Parashari reasoning (house significations, lordship, dignity, D10 usage).
- B2. Yogas are described for what the configuration is, without overclaiming their results; Neecha Bhanga is treated as a cancelled debilitation.
- B3. The application's conventions listed above lead to reasonable conclusions for this chart.
- B4. Supporting and limiting factors are weighed honestly. Mixed indications are not presented as clear.

### C. Career guidance
- C1. The employment-versus-independent conclusion is reasonable for this chart and is not contradicted anywhere.
- C2. Field recommendations match their ratings, and weakly supported fields are not recommended.
- C3. Next steps are concrete, actionable, specific to this chart and tied to its facts and dates.
- C4. Nothing promises outcomes, prescribes remedies or makes claims about health or longevity.

### D. Timing
- D1. The running Mahadasha and Antardasha are named correctly and described as current; coming periods as coming.
- D2. Every date matches the Vimshottari timeline in the chart file.
- D3. The tone given to each period, and the advice for it, is a reasonable reading of its lord.

### E. Consistency and repetition
- E1. The sections do not contradict each other (work style, strengths, timing).
- E2. Each section does its own job (overview, timing, chart structure, current situation, decisions) without repeating the others.

### F. Readability and value
- F1. Clear, natural English for a reader who knows no astrology; terms are explained.
- F2. Specific to this person rather than generic filler.
- F3. Overall, the report is worth ₹299 to a customer. Give a yes / no / almost answer and a reason.

### Summary sheet

| Report | A | B | C | D | E | F | Overall /10 | Must-fix issues |
|---|---|---|---|---|---|---|---|---|
| Delhi | | | | | | | | |
| Belagavi | | | | | | | | |
| Mumbai | | | | | | | | |

## Note on the generating commit

These reports predate a later prompt-only change (in the same PR). That change tells every section other than Career Overview not to restate the employment-versus-independent conclusion, and lists more filler phrases to avoid. Repetition of that conclusion (E2) and filler (F2) are therefore expected in these three reports. Please still note them.
