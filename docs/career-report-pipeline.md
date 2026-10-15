# Career report pipeline (facts-first)

## Why this design

Six live evaluations of the free-prose design (PR #116) failed. In that design the model wrote every placement, date and conclusion in its own words, and about fifteen pattern rules tried to verify that prose. Across the last three runs about 22 rejections included no factual error about the chart: they rejected correct text (a fact cited in the wrong block, a field word near "roles", "could present challenges", the required work-style sentence). Meanwhile two factual errors passed ("Mars … the 11th house", "Mercury holding the 10th position"). Rules written for free prose conflict with each other and leak, and all-or-nothing gating made a complete report unlikely.

The facts-first design removes the cause: **code writes every astrological statement; the model only explains statements it is given.**

## Structure

`careerReportEvidence.ts` recomputes the stored birth with the canonical engine. It refuses a stored chart the engine does not reproduce, and an approximate birth time, before any request. `buildCareerReportFacts` then writes reader-facing sentences, each with an id:

| Section | Facts (code) | Required explanations |
|---|---|---|
| Career Overview | work style (6th vs 7th house support and the business rating); the two best-supported fields; the best-placed and most challenged career planets | all four |
| Favourable & Difficult Periods | every Mahadasha/Antardasha overlapping the next four years, with engine dates and a tone (supportive / mixed / demanding) with its reasons from the lord's dignity, houses ruled and occupied, and D10 placement | every period |
| Your Birth Chart | Lagna; 10th house (sign, occupants, aspects, support); 10th lord (D1 and D10); D10 Lagna; D10 10th house; career significators; up to four career-linked yogas; D10 birth-time caveat | 10th house, 10th lord, D10 Lagna, D10 10th |
| Current Career Situation | running Mahadasha and Antardasha with dates, lords' condition, houses ruled and D10; the next sub-period | Mahadasha, Antardasha |
| Personalised Guidance | the six field assessments with their reasons; planning dates | every field rated well supported or mixed; at least 3 next steps |

Every section also requires a synthesis. Optional explanations cover the Lagna, the significators, the yogas, a weak field and the next sub-period; caveats and planning dates are shown without an explanation. The work style is decided by code, so no section waits for another and the model cannot contradict it. Yoga descriptions keep the engine's configuration only, never its one-line promise ("status and success").

## Generation

One request per section, all five in parallel (`max_tokens` 1,400). The model returns `{explanations: {factId: text}, synthesis, steps?: [{factIds, text}]}`. Each explanation is printed directly after its fact, so citations cannot drift.

`slotProblems` checks each piece of text against the facts it explains. Its vocabulary is closed: any planet, sign, house number, year, month-year or yoga it names must already be in those facts, and it may not state degrees. It also enforces:
- the shared answer guard against the whole chart;
- a planet placed in a house must match the calculated house;
- no promised outcomes and no remedies;
- no recommending a weakly supported field;
- no contradicting the work style;
- no internal terms;
- length limits.

A sentence of eight or more words repeated anywhere in the report is removed from the later section.

**Coverage, per section, never as a percentage.**
- An invalid optional explanation is dropped and its fact still shows.
- An invalid or missing required slot is requested again in **one correction round**. The correction asks only for the failed slots (`max_tokens` 900); a truncated or malformed reply is asked for again whole.
- Anything required that is still invalid fails the order, which is refunded by the existing path.
- A transport failure ends the report.

**Spending and time.**
- One ledger reserves each call's worst case before dispatch: UTF-8 prompt bytes plus 128 at $2.50/M, and all permitted output tokens at $10/M. It refuses beyond $0.25.
- With no usage reported at all, five sections plus five whole re-requests reserve at most about $0.236 on the test charts.
- Missing usage, network failures and timeouts consume the reservation.
- SDK retries are disabled.
- The six-minute deadline aborts every request; two rounds of at most 120 seconds each fit well inside it.

## Fixes from the first live report (db644dd)

The first facts-first report passed (6 calls, $0.0377) and was reviewed in full. Every chart fact was correct; the review found these defects, now fixed and replayed with the model's own text in `tests/unit/career-report-pipeline.test.ts` (`tests/fixtures/career-live-db644dd.ts`):

- **False rejections that dropped the two best next steps and forced a correction.**
  - "Mercury's role in your D10's 10th house" is now read as lordship, not a placement.
  - The shared guard's "current" applies only to the part of the sentence around its own period, from the previous period mention to the next. "Use the current Saturn Antardasha to prepare for the Mercury Antardasha" no longer claims Mercury runs now. This also applies to Ask.
  - Explanations of D10 facts (tagged `chart: 'D10'`) are read in the D10 unless they name the D1, by the house check and by the guard.
- **Fact wording.**
  - "The lord of your 10th house, Jupiter, …" (it was "Its lord").
  - A planet ruling the Lagna, the 10th and the D10 Lagna is described once.
  - The overview acknowledges every well-supported field before naming the strongest two.
  - When no career planet has a strong dignity, the best-placed one is called moderate.
- **Strength.** A planet may be called strong only if its dignity, in the chart its fact is about, is exalted, own sign or Moolatrikona.
- **Tendencies, not certainties.** These are refused:
  - "will" before an outcome verb (bring, favour, come, succeed, …), unless hedged;
  - "ensures", "guarantees" and similar;
  - "indicates a favourable … success".

  "You will need to", "will begin on" and "will likely" are accepted.
- **Work style.** A preference for one arrangement ("more … in independent settings", "rather than employment") contradicts a mixed conclusion unless the sentence also speaks of a mix. Business as a field is not an arrangement.
- **Usefulness.** At least one valid next step must act on a well-supported field, and a step that names a year must cite the planning dates.
- **Filler.** These are refused:
  - restating the placement just printed (sign and house);
  - a short list of stock phrases ("natural leader", "inspire others", "great candidate", …).
- **Distinct sections.** Each section's purpose states its one job and names what belongs to another section.

## Evaluation

`npx tsx scripts/evaluate-career.ts --run` needs a dedicated non-production `NAVAGRAHA_CAREER_EVAL_API_KEY`. It writes one synthetic report (Delhi, 1985-03-22 06:15) under the same limits and saves the report and every section attempt (text, problems, dropped slots) to a private (0600) temporary file, also on failure. Only this script passes the `onSection` hook; the order path never logs model text.

`tests/unit/career-report.test.ts` checks the facts against the engine for three charts (placements, D10, dates, running periods, the four-year window, the work style and the required slots) and that no engine shorthand or yoga promise reaches the reader. `tests/unit/career-report-pipeline.test.ts` uses realistic replies (`tests/fixtures/career-replies.ts`) to cover:
- generation for three charts;
- each kind of added fact being rejected, and the sentences the old checks wrongly rejected now passing;
- optional drops, slot-only corrections, required coverage and next steps;
- whole re-requests and repetition;
- transport failure and refund, and delivery;
- the deadline, the budget, and the evaluation hook.

These tests prove the contracts, not a live success rate. **Live acceptance is unverified until a generated report passes technical validation and a substantive quality review.**
