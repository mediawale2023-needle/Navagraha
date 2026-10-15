# Career report evidence pipeline

## Incident and change

Order c4e71a76-65d9-42ad-89fe-c246672d2a0b stopped after three calls because eight sections failed and the previous regeneration cutoff was five. The first-pass diagnostics do not preserve the rejected D10 sentence, so its exact cause cannot be inferred. Prior prompts competed for a shared 4,000-token output, called length a guide while checks enforced minima, and required a shortened cancellation name that the required-evidence matcher rejected. PR #114 repaired label recognition but retained free-form factual generation.

The supplied 1991-11-13 12:30 Belagavi chart reproduces Jupiter in Leo in D1 and Capricorn in D10; Venus in Virgo in D1 and Leo in D10. Saturn Antardasha within Jupiter Mahadasha starts 2027-01-21 and ends 2029-08-03. These values come from the existing engine, not a model or replacement astronomy library.

## Authority and rendering

`careerReportEvidence.ts` recomputes the stored resolved birth input with the unchanged canonical engine and compares placements, angles, houses, aspects, divisional charts, periods, yogas and strengths. A mismatch fails before spending; this pipeline never silently updates a chart. Each report freezes one `asOf` instant.

Ten section packets contain verified facts, explicit D1/D10/Vimshottari contexts, supporting and limiting indications, permitted interpretation scope, and exact period dates. Field assessments reuse the existing traditional significator tally. An evidence gap is described as a gap, not manufactured support. Context is present in the reference ID, typed context list and displayed facts. No birth name, coordinates or private customer details are sent to the model.

Code renders the factual skeleton, including the birth-time caveat, field ratings and yoga conditions. The model returns three structured interpretation blocks, each with references and contexts: supporting, limiting, conclusion. It may not write placements, dates, planetary names or technical factual restatements in free prose. The conclusion may reference only evidence already discussed. The server also renders PDF/UI chart tables from canonical data; legacy projections cannot reintroduce conflicting facts.

This is intentionally a change from unstructured narrative to an evidence-and-interpretation report. Its readability and interpretive usefulness require human review. A complete factual skeleton alone is NOT sold as a completed paid report. No automatic fallback supplies thin text after failed interpretation. Optional AI remedies are omitted; no invented or gemstone remedies are added.

## Validation policy

Existing word minima and the existing 10% tolerance remain; the existing no-career-yoga exception remains. Each interpretation block additionally needs substantive prose. Typed reference/context checks replace ambiguous sentence-level reference guessing. Both supporting and limiting blocks are mandatory, and new evidence cannot first appear in the conclusion. Professional recommendations are owned by the deterministic field assessment.

Shared chart-accuracy validation remains applied to AI prose. Canonical verification protects all rendered factual values. The Neecha Bhanga alias correction accepts cancellation terminology without authorising an undetected yoga. Generic stock phrases, certainty, factual restatements and new free-text field recommendations are rejected. Repetition checks operate on AI interpretation rather than deliberately repeated factual references; this avoids treating a required citation as duplicated prose. The same existing repetition thresholds apply. Final assembly is all-or-nothing.

These controls cannot prove that arbitrary natural-language interpretation is meaningful or fully justified. Reference validity is not semantic entailment. Pattern checks are not a complete natural-language parser. Human review and live-model evaluation are acceptance requirements, especially for subtle unsupported implications and readability.

## Spending and time

One shared in-memory ledger belongs to one report invocation. Three workers call a synchronous reservation method BEFORE dispatch, so JavaScript workers cannot race admission. The ledger limits settled plus in-flight reserved cost to $0.25. Input reservation uses UTF-8 byte length plus 128 framing tokens as a conservative byte-BPE bound; output reserves all 1,400 permitted tokens. Rates are the repository's GPT-4o assumptions: $2.50/million input and $10/million output, without assuming discounts.

Reported usage settles a reservation exactly once. Missing usage, malformed usage, network failure and timeout consume the entire reservation. Valid usage from a malformed/truncated response still counts. Actual usage exceeding the reservation is recorded without clamping and prevents further spending. Automatic SDK retries are disabled for Career only. Ten initial calls and at most two targeted corrections are allowed; an affordable reservation is still required for each correction. More than two rejected sections stops recovery instead of masking systematic first-pass failure.

The whole report has a six-minute abort deadline, with a 60-second request timeout. The deadline also rejects an adapter that ignores cancellation. No request may start after cancellation. Reservations for unresolved calls remain charged. Process restarts are handled by the existing stale-order failure mechanism; there is no new durable queue or cross-process resume. Sharing a report ledger across separate server processes is not supported or needed by this single-invocation pipeline.

This is a dispatch/spending-estimate ceiling, not a provider billing guarantee. Provider price changes, changed token framing/tokenisation, anomalous usage, provider-side processing after a disconnect, and separately initiated report invocations can make an invoice differ. Abort cannot retract a provider request. The implementation does not claim to reverse provider charges or persist its local ledger across process loss.

Planning estimate: about $0.10–$0.14 for an ordinary report, depending on tokens. Mock usage of 1,500 input/450 output tokens per call totals $0.0825; this is NOT measured provider cost. Conservative reservations can refuse an otherwise affordable call, particularly following uncertain usage. Do not raise the correction allowance to compensate for a poor first pass.

## Acceptance and evaluation

Regression tests use readable prose and canonical charts for the supplied birth details plus Delhi and Mumbai examples. They check first-pass assembly with zero corrections, swapped contexts and placements, exact dasha dates, reference coverage, content minima, recovery preservation, repetition, transport failures, truncation, budget concurrency, unknown usage, cancellation and delivery through mocked storage. These demonstrate orchestration and deterministic contracts, not a live-model success rate.

Run `npx tsc --noEmit --pretty false`, `npm run build`, and `npm test -- --reporter=dot --silent`.

Implementation verification: TypeScript passed; production build passed; focused Career tests passed (31); complete suite passed (1,360 tests, 87 files). The suite skipped 98 database-dependent tests in 11 files because no test database was configured. Existing build warnings concern bundle size and stale Browserslist data; existing test warnings concern duplicate keys in unrelated mocks. No production database was used. All three chart fixtures assembled ten sections with zero corrections. This is a deterministic contract result, not a measured GPT-4o first-pass rate.

Live evaluation is opt-in: `npx tsx scripts/evaluate-career.ts --run`, with a dedicated non-production `NAVAGRAHA_CAREER_EVAL_API_KEY` supplied securely in the environment. It never loads `.env`, uses the production account/order path, or touches a database. One synthetic report is bounded by the same $0.25 ceiling and six-minute deadline. It prints usage metrics and saves the report in a private temporary JSON file for human review. Do not substitute a production key. A single successful evaluation is evidence of one successful sample, not a reliability estimate.

At implementation time no dedicated evaluation key was available: **live GPT-4o acceptance is UNVERIFIED**. Before merge readiness, review live first-pass acceptance/cost and the actual report for substantive personalised interpretation. Before claiming production delivery is repaired, an approved deployment must show successful persistence, ready-state polling and report/PDF access, with no inappropriate charge/refund behavior. No deployment or production operation is part of this PR.
