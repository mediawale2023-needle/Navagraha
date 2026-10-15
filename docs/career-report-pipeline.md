# Career report evidence pipeline

## Incident and change

Order c4e71a76-65d9-42ad-89fe-c246672d2a0b stopped after three calls because eight sections failed and the previous regeneration cutoff was five. The first-pass diagnostics do not preserve the rejected D10 sentence, so its exact cause cannot be inferred. Prior prompts competed for a shared 4,000-token output, called length a guide while checks enforced minima, and required a shortened cancellation name that the required-evidence matcher rejected. PR #114 repaired label recognition but retained free-form factual generation.

The supplied 1991-11-13 12:30 Belagavi chart reproduces Jupiter in Leo in D1 and Capricorn in D10; Venus in Virgo in D1 and Leo in D10. Saturn Antardasha within Jupiter Mahadasha starts 2027-01-21 and ends 2029-08-03. These values come from the existing engine, not a model or replacement astronomy library.

## Five-section design (supersedes the ten-section draft in PR #115)

The ten independent section calls in PR #115 failed live evaluation repeatedly. The report now has five coordinated sections, written in one request: **Career Overview**, **Favourable & Difficult Periods**, **Your Birth Chart**, **Current Career Situation**, **Personalised Guidance**.

## Authority and rendering

`careerReportEvidence.ts` recomputes the stored resolved birth input with the unchanged canonical engine and compares placements, angles, houses, aspects, divisional charts, periods, yogas and strengths. A mismatch fails before spending; this pipeline never silently updates a chart. Each report freezes one `asOf` instant. Approximate birth times are refused before any request (the order route also refuses them before any charge).

`buildFiveCareerEvidence` regroups the verified facts of `buildCareerEvidence` into five packets without calculating anything new. Favourable & Difficult Periods lists every Vimshottari Mahadasha and Antardasha that overlaps the four years after `asOf`, with the engine's exact boundaries, plus each period lord's D1 and D10 placement. Current Career Situation keeps only the running Mahadasha and Antardasha. Your Birth Chart covers the D1 Lagna, the 10th house and its lord, significators and aspects, D10, the D1/D10 comparison and the detected yogas. No birth name, coordinates or private customer details are sent to the model.

Code renders the factual skeleton of every section: a "Terms used in this section" glossary owned by the application (`CAREER_DEFINITIONS`, only the terms that appear), the numbered verified evidence, the birth-time caveat, field ratings and yoga conditions. The model returns, per section, three interpretation blocks (supporting, limiting, conclusion) with fact references, plus one shared `workStyle` (employment / entrepreneurship / mixed) that every section must agree with. Block contexts are derived from the cited facts, not trusted from the model. The server renders PDF/UI chart tables from canonical data; legacy projections cannot reintroduce conflicting facts. Optional AI remedies are omitted.

## Validation policy

`validateFiveCareerDraft` checks each block: every reference must exist in that section; a named placement must match a cited fact (a correct placement without a chart name is scoped, e.g. "in D10, Jupiter is in Capricorn"); a planet named in prose must appear in a cited fact; field recommendations need their `D1.D10.field` assessment and weak fields may not be recommended; any date must appear in a cited fact and a stated Mahadasha/Antardasha start or end must equal the engine's boundary; certain outcomes and gemstone/ritual remedies are rejected; each block needs 45 words and each section 225. The shared answer guard (`textProblems`) then checks the prose against the whole chart (signs, houses, D1/D10 scope, yogas, dates). The conclusion may only use evidence weighed above. Across sections, an identical interpretation paragraph is rejected.

These controls cannot prove that arbitrary natural-language interpretation is meaningful or fully justified. Reference validity is not semantic entailment. Human review and live-model evaluation are acceptance requirements.

## Generation, corrections, spending and time

One request writes all five sections (`max_tokens` 6,000). A malformed envelope (invalid JSON, wrong types, a duplicated or unexpected section id), a truncated or refused response, or a transport error fails the order at once: a full regeneration would double the cost. Echoed extra keys are ignored. A missing or rejected section is corrected on its own (one call per section, `max_tokens` 1,800) with its listed problems and the established `workStyle`; accepted sections are never sent back or rewritten. At most two sections may be corrected (`MAX_CAREER_CORRECTIONS`); more than two first-pass rejections is a systematic failure and stops without further calls. Anything still invalid fails the order, and the existing path refunds it.

One in-memory ledger per report reserves each call's worst case before dispatch (UTF-8 prompt bytes + 128 framing tokens at $2.50/M, all permitted output tokens at $10/M) and limits settled plus reserved cost to $0.25. Missing or malformed usage, a network failure and a timeout consume the whole reservation. With no usage reported at all, the first pass plus two corrections reserves about $0.19–$0.21 for the three test charts, so both corrections can still be afforded. SDK retries are disabled. The whole report has a six-minute abort deadline (three calls with a 120-second request timeout each fit inside it), which also rejects an adapter that ignores cancellation.

This is a dispatch/spending-estimate ceiling, not a provider billing guarantee: price or tokenisation changes, provider-side processing after a disconnect and separately initiated invocations can make an invoice differ. Abort cannot retract a provider request.

## Acceptance and evaluation

`tests/unit/career-report-pipeline.test.ts` uses readable prose and canonical charts for the Belagavi, Delhi and Mumbai birth details. It checks the five headings from one request; that every rendered D1/D10 placement and every date matches the canonical chart and Vimshottari boundaries; the four-year window across a Mahadasha boundary; invented placements, yogas and dates; field recommendations; malformed, truncated, refused and empty responses; targeted correction of a missing and of a rejected section with accepted sections byte-identical; the two-correction limit; work-style consistency; the approximate-time refusal; the worst-case budget; the six-minute deadline; and delivery and refund through the existing order path. These demonstrate orchestration and deterministic contracts, not a live-model success rate.

Live evaluation is opt-in: `npx tsx scripts/evaluate-career.ts --run`, with a dedicated non-production `NAVAGRAHA_CAREER_EVAL_API_KEY`. It never loads `.env`, touches a database or the order path, is bounded by the same $0.25 ceiling and six-minute deadline, prints usage metrics and saves the report to a private temporary file for human review. **Live GPT-4o acceptance of the five-section report is UNVERIFIED.**
