# Career report pipeline (facts-first, plan-driven)

Test accounts only (`FEATURE_CAREER_FACTS_FIRST`; see CLAUDE.md). Customers still receive the three-part report (`server/careerReport.ts`).

## Why this design

**Facts-first (PRs #118–#124).** Code writes every astrological statement and the model only interprets what it is given. In the earlier free-prose design the model stated placements itself, and pattern rules both let errors through and rejected correct text.

**Plan-driven (this change).** PR #124's report had a coherence problem. The model explained one fact at a time, and a rule forbade any planet or house outside that fact, so it could not connect evidence. The seven-page sample read as fact-then-boilerplate.

Its conclusions also came from three private tallies that disagreed with the app's own evidence engine:
- a planet ranking;
- an unweighted field tally that counted lordship as support;
- a period "tone" that disagreed with the engine's period-lord rule for the running sub-period in 61% of 300 random charts.

The report now builds one shared interpretation in code and lets the model write paragraphs that cite it.

## Evidence ledger (`server/careerLedger.ts`)

Every statement the report may interpret is an item with an id the model cites ("E12"):
- **Engine items, restated, never re-judged:**
  - the production Career resolution (`domainResolution`: the Kundli page's Career verdict, its evidence and the running periods);
  - the engine's house rules (`houseEvidence`, exported for this) for the 1st, 2nd, 3rd, 5th, 6th, 7th, 9th, 10th and 11th houses.

  Yoga items keep the configuration only: no one-line promise, and an engine "Neecha Bhanga Raja Yoga" is a cancelled debilitation.
- **Career rules** (`CAREER_RULES`, each with its limits). Each applies an existing engine convention to a new input:
  - the karaka dignity rule for each field significator;
  - the 10th lord's D10 dignity rule for the other career planets;
  - the period-lord house rule, read in the D10;
  - the sub-period lord's sign position from the major-period lord. This one is provisional: shown and never counted.
- **Context** (never counted):
  - lordships of the Lagna, the 10th, the D10 Lagna and the D10 10th;
  - links to the 10th;
  - the same sign in D1 and D10. No vargottama strength is assumed; vargottama is a D9 term.
  - each planet's period-lord capacity (`planetCondition`), Rahu and Ketu included.

Items are `counted`, `experimental` or `context`. Strength classes are the engine's (strong / moderate / weak). **No number is introduced**: every balance is the engine's own (`evidenceBalance`, shared with `resolveDomain`).

## Synthesis (`server/careerSynthesis.ts`)

Conclusions are ledger items too ("F.finance", "C.finance.advisory", "R.Jupiter", "P.antardasha", "T.verdict"). Each lists the items it rests on (`derivedFrom`). Rules: `CAREER_SYNTHESIS_RULES`.

- **Overall reading.** The production Career verdict and confidence; identical to the Kundli page by construction and by test.
- **Fields.** The six `FIELDS` are kept. Each is judged by `resolveDomain` over its own counted evidence: significator dignity in D1 and D10, D10 house, and the engine's house rules for its houses.
  - **Lordship of the 10th or the D10 Lagna is a link, not support:** it makes the planet's condition matter, whichever way that points. The old tally counted it as a plus.
  - **House rules (`house-neutral`).** Some engine rules change direction with the house type: a malefic occupying or aspecting a house, and a lord placed in a difficult house, which is not held against the 6th. These would favour fields whose houses are upachaya. Fields therefore use only two-sided house rules (lord placement except the 6th, lord dignity, bindus, Dig Bala). The 6th-against-7th comparison uses every rule that reads all houses alike. Measured below.
  - **Ordering.** By verdict, then by the engine balance, which only orders.
  - **Comparisons.** Neighbouring fields are compared by the counted items only one of them draws on. Identical evidence is reported as **indistinguishable**; differences that are all weak as **not clearly separable**.
- **D1 and D10.** For each career lord (10th, Lagna, D10 Lagna, D10 10th; the Sun and Saturn while fewer than three lords are distinct), the birth-chart reading is the engine's capacity and the D10 reading is its counted D10 items. Possible relations:
  - **reinforces:** only agreeing D10 items;
  - **contradicts:** only opposing items;
  - **qualifies:** both, or a lean where the birth chart is neutral;
  - **unresolved:** none, or a split against a neutral birth chart.

  The same rule sets the D10's bearing on the overall verdict. Nothing forces agreement. The birth-time window of the D10 Lagna is stated.
- **Employment or independent work.** The 6th and the 7th are each read with the engine's verdict bands, and the conclusion lists each house's evidence for and against:
  - one supportive and the other not decides a lean;
  - both supportive is a mix;
  - otherwise the question is **unresolved**.
- **Strengths, challenges, recurrence.** The firmest counted items each way. A planet "recurs" when two or more counted natal items about it point the same way; the heaviest by engine weight is named.
- **Periods.** For the running Mahadasha, the running Antardasha and the next Antardasha:
  - dates are the engine's, and the tone is the engine's period-lord capacity;
  - what the period activates is the houses its lord rules and occupies, and the fields it signifies (Rahu and Ketu also through the lord of the sign they occupy);
  - the D10 standing and the relation to the major-period lord qualify the tone, never change it;
  - the shift to the next sub-period lists the fields it brings forward and drops.
- **Theses.** Eight one-paragraph conclusions (verdict, leadership, arrangement, fields, D10, strength, challenge, timing), with one-line briefs.

## Plan and generation

Seven reader sections are written in five requests, all in parallel. Every request receives the whole plan (in full where it may cite a thesis, one line where it may not):

| Part | Sections | Paragraphs (slots) |
|---|---|---|
| overview | Executive Career Summary, Professional Identity | summary.reading, summary.direction, summary.now, identity.foundation, identity.arrangement |
| chart | Strengths and Challenges, D1 and D10 Analysis | strengths, challenges, d1d10.1–3, d1d10.overall |
| fields | Professional Field Comparison | one per field in rank order, fields.comparison |
| timing | Career Timing | timing.mahadasha, timing.antardasha, timing.next, timing.shift |
| strategy | Career Strategy | strategy.approach + 3–5 next steps |

Then come a deterministic **Evidence Appendix** (only the evidence the paragraphs cite, grouped by D1, D10 and periods, plus the rules) and the **Glossary**. The structured analysis is in `content.careerAnalysis` for the PDF (Milestone B).

**Slots.** Each slot has a job, a fixed list of citable ids and the ids it must cite. The model returns `{"slots": {"<id>": {"text", "cites"}}, "steps": [...]}`. Field paragraphs open with a code-written lead (the field and its reading).

## Checks (`server/careerReportRendering.ts`)

**Citation rules (new).**
- Every paragraph cites at least one id. Unknown ids, ids outside its list, or a missing required id are refused.
- **Vocabulary is scoped to what is cited**: the cited items plus the items a cited conclusion was built from (one level). The same closed checks as before then apply to that text: planets, signs, house numbers, years, month-years and yogas, and no degrees.
- A single-fact paragraph may cite one item. A paragraph that **combines or compares** must cite more. That means one which names two planets, both charts or two fields, or uses an explicit relating word (whereas, unlike, compared with, outweighs, offsets, contradicts, reinforces…). Ordinary comparatives do not count.
- Relating the birth chart and the D10 needs evidence from both; a D1–D10 relation item counts as both. Comparing two fields needs both assessments.
- No ids in the prose.

**Shared checks (unchanged).**
- the answer guard against the whole chart;
- house placements against the chart;
- strength only for exalted, own or Moolatrikona, judged in the chart the sentence names;
- no promised outcomes, remedies, stock phrases or generic advice;
- no repeated scaffolds or unresolved field references;
- no running period called upcoming;
- no work-style contradiction (an unresolved style forbids favouring either);
- no recommending a weakly supported field;
- report-wide repetition.

The old per-fact "explain the connection" word check is not used for paragraphs; citations carry the traceability.

**Length and steps.** Paragraphs are 35–130 words (the prompt asks for 60–110). Steps: at least three valid, one citing a best-supported field.

## Coverage, retries, spending, time

These are unchanged except for the output allowance:
- two correction rounds for failed required slots only;
- transport retries (2) and format retries (1) before judging;
- the six-minute deadline;
- rule-code-only diagnostics;
- refund on failure through the existing path.

**Output allowance per part (`partTokens`).** Each part's allowance is now what its paragraphs can need at the checks' maximum: 100 tokens, plus 205 a paragraph, plus 95 a step. The ceiling is still 1,400. Parts reserve 1,125 / 1,330 / 1,400 / 920 / 780 tokens.

**Spending guarantee kept.** With no usage reported, the first pass plus a whole retry of every part stays under $0.25:
- seven synthetic charts: at most $0.2448;
- 200 random synthetic charts: none over.

This is pinned per chart in `tests/unit/career-report.test.ts` and `tests/unit/career-report-pipeline.test.ts`.

## Measured (deterministic, no model)

300 random synthetic charts, PR #124 → this design:

| Measure | PR #124 | Now |
|---|---|---|
| Running sub-period tone disagrees with the engine's period-lord rule | 61% | 0% |
| Career verdict matches the Kundli page | not stated | 100% |
| Mean distinct field ratings per chart | 2.42 | 2.55 |
| Mean pairwise evidence overlap between fields | 0.18 | 0.14 |
| Fields rated well supported per chart | 2.36 | 2.93 |
| Administration in the top tier | 66% | 56% |
| Advisory in the top tier | 24% | 26% |
| Work style: mixed / employment / independent / unresolved | 66 / 30 / 4 / – % | 15 / 31 / 16 / 38 % |
| D10: reinforces / qualifies / contradicts / unresolved | – | 14 / 63 / 1 / 22 % |
| Charts with an indistinguishable or not clearly separable pair | – | 6% |

### Why Administration reaches the top tier in 56% of charts

Investigated without changing the scoring (`npx tsx scripts/career-field-attribution.ts`). The method: recompute every field's verdict over the same 300 charts with one evidence source left out.

| Left out | Administration | Finance | Business | Government | Communication | Advisory |
|---|---|---|---|---|---|---|
| nothing (as built) | 56% | 54% | 44% | 41% | 38% | 26% |
| house bindus (`house.sav`) | 56% | 59% | 54% | 55% | 60% | 49% |
| significator dignity | 49% | 57% | 49% | 38% | 41% | 28% |
| D10 items | 58% | 59% | 51% | 43% | 42% | 34% |
| lord placement | 55% | 53% | 41% | 41% | 32% | 25% |

**Bindus (Sarvashtakavarga) drive the spread.** Mean bindus are structurally uneven by house:
- higher: 11th 31.8, 6th 30.4, 10th 30.3;
- lower: 5th 26.4, 9th 26.3, 7th 25.0.

Administration's houses are the 10th and 6th, while Advisory's (5th, 9th) and Communication's (3rd, 7th) include low-bindu houses. Read against the app-wide 28-point policy (`savReading`), bindus net +1.38 a chart for Administration and −0.96 for Advisory. Without them the fields fall within 49–60%: Administration does not rise, the others do.

**The Sun's and Saturn's dignity is the second, smaller factor** (56% → 49% without it).

Nothing was changed. The bindu reading is a shared policy, and CLAUDE.md forbids a second set of thresholds. **Question for a qualified astrologer:** should bindus in the 6th (and other dusthanas) be read on the same scale as other houses when comparing professions?

### Employment or independent work

The conclusion states each house's counted evidence, for and against, with weights. When it does not settle, it says why: neither house is clearly supportive, or there is too little evidence. The Professional Identity paragraph is asked to explain both sides.

Example (Kolkata, unresolved):
- the 6th is mixed: bindus are for it; a strong debilitated 6th lord is against it;
- the 7th is mixed: Jupiter in the 7th is for it; the 7th lord's dignity is against it.

### Spending on every path

Measured on the real pipeline with failure-injecting mocks on seven charts (`tests/unit/career-report-pipeline.test.ts`, "spending under failure").

| Scenario | Completes | Most charged |
|---|---|---|
| First pass, no usage reported | 7/7 | $0.1223 |
| One format retry, or one transport retry, per part; no usage | 7/7 | $0.2445 |
| Every paragraph invalid once, round 1 corrects; no usage | 7/7 | $0.2417 |
| Two transport retries plus a format retry per part; or a second correction round; or endless truncation; or endless 503s; no usage | **fails closed at the ceiling** (refund path) | $0.2445 |
| Every paragraph invalid twice, usage reported (the normal case) | 7/7, 15 calls | $0.1342 |

**What the ceiling guarantees:**
- spend never exceeds $0.25;
- nothing is left reserved;
- every refusal happens before a request is sent.

With no usage reported, the ceiling admits exactly one extra request per part; anything more fails and is refunded. This is the guarantee PR #124 had.

**Every call path goes through the ledger.** Admin test orders are also reserved against the admin daily AI budget by `createOpenAI`. SDK retries are off.

**The figure is a ceiling, not a measurement.** Reservations count every UTF-8 prompt byte as a token, so real costs are lower; the earlier "$0.2448" was the one-retry-per-part row only. Across 200 random charts that row peaks at $0.2468.

### Validator rules on real GPT-4o text

The 99 paragraphs GPT-4o wrote in the earlier live runs (f729c61, db644dd) were judged by today's paragraph checks, with the whole chart's evidence as vocabulary so that only the writing rules are measured.

**Results:**
- **64** pass every rule.
- **22** fail on length only: they were written to the old 30–70-word slots, and the prompt now asks for 60–110.
- **13** rule hits, mostly real errors:
  - a debilitated Mercury called strong (4);
  - a running period called upcoming (3);
  - promised outcomes (2);
  - stock phrases (2);
  - a yoga the chart does not have (1);
  - a weakly supported field recommended (1).
- **One likely false rejection:** a D10 placement in a sentence that names the D10 only in the sentence before it ("…while Jupiter in the 3rd house…"). The prompt asks for "in the D10" on every D10 placement; the live run will show whether that suffices.
- **25 of 99** would need a second citation under the combine/compare rule. That is only a problem if the model under-cites, which only a live run can show.

**Rules most likely to cause corrections, to watch live:**
- the citation-scoped vocabulary;
- the combine/compare citation rule;
- report-wide repetition between the Executive Summary and the sections it summarises;
- the D10-context house rule above.

**Rules that could push formulaic writing:**
- naming the field in every recommendation (the unresolved-reference rule);
- the work-style rule, which refuses any sentence preferring an arrangement when the answer is open.

The old per-fact "explain the connection" word check, PR #124's main source of formula, no longer applies to paragraphs.

## What is not yet verified

- **Model writing.** The generation tests and the sample content (`docs/career-evaluations/premium-a/`, `scripts/career-sample-content.ts`) use mocked paragraphs (`tests/fixtures/career-premium-replies.ts`). They prove the contracts, not GPT-4o's writing.
- **Live run.** `NAVAGRAHA_CAREER_EVAL_API_KEY=… npx tsx scripts/evaluate-career.ts --run --all` runs the seven charts live and records calls, corrections, cost and latency. Live quality is unverified until that run passes and a substantive review agrees.
- **Classical sources.** The career rules and the D1/D10 relation rule are conventions applied from the engine, documented with their limits. None claims a verse.

## Earlier fixes still enforced

The fixes from the db644dd and f729c61 live reviews remain in the shared checks:
- the D10 house reading;
- "current" scoped to its period;
- running periods never called upcoming, including in a list;
- only affirmative promises refused;
- direct house placements only;
- "work chart" read as the D10.

Recorded sentences that must still be refused are in `tests/unit/career-live-replay.test.ts`. The whole-report offline replay was retired with the old prompt format.
