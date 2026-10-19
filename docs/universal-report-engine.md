# Universal paid-report engine: audit, architecture and rollout

Status: feature branch implementation; not merged, deployed, or enabled. This document distinguishes repository evidence from hypotheses and mocked/offline verification from live reliability.

## A. Product inventory

The active catalogue is seeded by `server/migrate.ts`; pricing is read from the catalogue unless `FEATURE_RELEASE_B_PRICING` is enabled. `Life Reading` remains supported by code and historical rows but is not currently seeded as a new active product. Kundli PDF, Ask, daily horoscope, matching, consultations and pooja/store purchases are separate products, not paid-report catalogue entries.

| Product | Slug / category | Current price | Endpoint | Legacy generation | Universal plan | PDF / delivery | Time policy |
|---|---|---:|---|---|---|---|---|
| Complete Life Report | `complete-life-report` / `life_complete` | ₹1,499 (₹999 with Release B) | `POST /api/reports/order` | 11 concurrent GPT-4o batches; at least 90% sections | 46 sections in 6 bounded calls | existing generic client PDF; persisted JSON; poll/notification | exact required |
| Career & Profession Report | `career-report` / `career` | ₹299 | same | legacy 3-part path; gated facts-first 5-part path | registry and shared durable lifecycle; retained facts-first evidence/synthesis adapter | existing premium Career PDF | exact required |
| Marriage & Love Report | `marriage-report` / `marriage` | ₹349 (₹299 with Release B) | same | one full GPT-4o draft and one possible full redraft | two schema-constrained calls of four sections; up to two targeted failed-section corrections | existing generic client PDF | exact required |
| Wealth & Finance Report | `finance-report` / `finance` | ₹299 | same | same generic path | same shared engine, finance blueprint | existing generic client PDF | exact required |
| Year Ahead Report | `year-ahead-report` / `year_ahead` | ₹499 | same | same generic path with transit text | same shared engine with as-of transit evidence | existing generic client PDF | exact required |
| Life Reading Report | historical/code-only / `life` | catalogue-defined when present | same | generic path | two shared calls of three sections; stable facts only when time is approximate | existing generic client PDF | approximate allowed with houses/vargas/timing withheld |

All products keep the existing order, debit, entitlement, refund, persistence and customer polling contracts. Historical stored report payloads are not rewritten.

## B. Existing architecture

```mermaid
flowchart TD
  O[POST /api/reports/order] --> P[Atomic wallet debit + report order]
  P --> C{Category / Career gate}
  C -->|Marriage, Finance, Year Ahead, Life| G[Generic whole-report GPT-4o path]
  C -->|Career legacy| CL[Three parallel parts]
  C -->|Career facts-first| CF[Five parallel evidence-scoped parts]
  C -->|Complete Life| L[Eleven concurrent batches]
  G --> V1[Length + regex-oriented fact guard]
  CL --> V1
  CF --> V2[Paragraph citation and Career guards]
  L --> V1
  V1 --> S[In-process fire-and-forget persistence]
  V2 --> S
  S --> D[Client polling + existing PDF renderer]
  S --> R[Failure / stale sweeper / idempotent refund]
```

## C. Root-cause findings

Confirmed from code and regression fixtures:

1. Three orchestration systems implement different completeness, retry and cost behavior. Only facts-first Career had a hard per-report ledger and six-minute deadline.
2. Generic reports redraft the whole report after a rejected section. Complete Life retries rejected headings within each batch but may still deliver with up to 10% missing.
3. Generic validation mixes factual checks and minimum length. Editorial constraints in the Career path can become delivery blockers. This causes unnecessary correction work and makes failures hard to classify.
4. Bare citation IDs do not demonstrate how a fact supports an interpretation. Conversely, paragraph-scoped Career citation rules can reject a legitimate shared synthesis when the paragraph does not enumerate every contributing assessment.
5. The legacy answer guard treated a named yoga/dosha topic as a positive assertion and only detected negation before the name. Predicate negation such as “Mangal Dosha is not present” could therefore be misclassified. The shared grammar helper now handles negation before or after the named condition.
6. Year Ahead and Complete Life previously received transit text in their legacy prompts, but the first universal blueprint draft did not create structured transit evidence. The blueprint now calculates dated transit evidence from the canonical chart.
7. Model-authored remedies were accepted after general prose validation in the generic legacy path. The universal path ignores model remedies and attaches only deterministic chart remedies.
8. Generation was a process-local promise. The HTTP request returned quickly, but a restart lost the work; the 30-minute sweeper later refunded it. No persistent claim or job record existed.
9. Payment and refund operations are already strong: debit/order creation is transactional, delivery updates only a processing order, and refund credit is guarded by `refunded_at` in a transaction.
10. Existing client PDFs are render-only and historical payload-compatible. The generic renderer lacked the Career renderer’s explicit unsupported-script rejection; it now performs the same preflight instead of silently dropping text.

Hypotheses requiring controlled live evaluation:

- Actual GPT-4o prose quality and schema adherence across adversarial charts.
- Real provider latency and correction frequency, especially for the 46-section Complete Life product.
- Whether one call gives enough editorial depth for every standard product within the configured output allowance.
- Whether the generic PDF’s visual density remains premium enough for long live prose; offline layout tests prove rendering, not editorial quality.

## D. Universal architecture

```mermaid
flowchart TD
  O[Order request] --> E[Eligibility + exact-time policy]
  E --> T[Atomic debit + report order + persistent job]
  T --> Q[(Postgres job queue)]
  Q --> W[SKIP LOCKED worker claim]
  W --> C[Canonical V3 chart: Swiss Ephemeris / Lahiri]
  C --> I[Existing deterministic interpretation context]
  I --> B[Report-specific typed blueprint]
  B --> N[GPT-4o JSON-schema narrative]
  N --> F[Level 1 factual gate]
  F --> K[Level 2 completeness + evidence-link gate]
  K --> X{Blocking failure?}
  X -->|yes| R[One/two bounded targeted corrections]
  R --> F
  X -->|no| EW[Level 3 editorial warnings]
  EW --> P[Atomic persist-before-notify]
  P --> A[Existing PDF adapter + customer access]
  F -->|cannot correct| RF[Fail + idempotent refund]
```

The typed registry owns report identity, required data and vargas, evidence domains/modules, sections, prompt limits, validation policy, renderer, delivery policy and approximate-time policy. Standard products use two calls (four sections each; Life three); Complete Life uses six groups of at most eight sections; Career keeps its richer deterministic Career ledger/synthesis as an adapter behind the same registry and durable delivery lifecycle.

The persistent job table uses `queued → generating → completed|failed` while the existing customer-visible order remains `processing → ready|failed`. This avoids breaking clients. Queued work survives restarts and claims are mutually exclusive. An in-flight job is not automatically replayed after a worker crash because the provider charge may already have occurred; the existing stale sweep fails and refunds it. This is a deliberate safety limit and means full mid-call restart recovery is not yet proven.

## E. Validator matrix

| Check | Legacy status | Universal status | Delivery effect |
|---|---|---|---|
| Canonical chart/version | retained | retained before any call | blocking |
| Incorrect planet/sign/house, dasha date, yoga/dosha, varga claim | retained shared guard | retained | blocking |
| Approximate-time restrictions | retained | registry + blueprint + guard | blocking |
| Strict structured response | JSON object only | OpenAI strict JSON Schema + Zod strict parse | blocking; one format retry |
| Required sections / depth | inconsistent; Complete Life allowed omissions | typed per-product required sections and minimum depth | blocking |
| Evidence support | prose/paragraph rules vary | section evidence IDs plus explicit evidence→conclusion explanations | blocking |
| Unknown/out-of-scope evidence IDs | Career-only | all universal products | blocking |
| Whole-report correction | generic legacy | removed | none |
| Targeted failed-section correction | Career and Complete Life variants | common bounded policy; accepted sections preserved | blocking after limit |
| Model-authored remedies | generally allowed after prose guard | discarded | deterministic remedies only |
| Repetition, generic phrasing, paragraph length | sometimes blocking | warnings/metrics only | non-blocking |
| Regex exceptions as evidence | legacy guard retained for concrete factual contradictions | not used as the support model; structured links establish support | factual guard only |

## F. Implementation surface

Created:

- `server/reportEngine/{types,registry,blueprint,prompt,runtime,validation,engine,feature,jobs,index}.ts`
- `tests/unit/universal-report-{engine,pdf,jobs}.test.ts`
- `scripts/universal-report-samples.ts`
- this document

Modified narrowly:

- schema/migration/storage for persistent jobs
- order route and startup for the gated durable worker
- feature and audit registries
- report quality helper extraction and the generic yoga/dosha negation defect
- existing AI service exports used by the adapter
- generic PDF pure renderer and unsupported-script preflight
- report fulfillment outcome reporting, without changing debit/refund rules

## G. Migration status

| Category | Registry | Blueprint/evidence | Shared runtime/validation | Durable lifecycle | PDF verified | Status |
|---|---:|---:|---:|---:|---:|---|
| Career | yes | existing richer Career ledger/synthesis | adapter retains Career budget/guards | yes | premium renderer | implemented; live prose not evaluated here |
| Marriage | yes | yes | yes | yes | generic renderer | implemented |
| Finance | yes | yes | yes | yes | generic renderer | implemented |
| Year Ahead | yes | yes, including dated transits | yes | yes | generic renderer | implemented |
| Life | yes | stable-fact policy | yes | yes | generic renderer | implemented; code/historical product |
| Complete Life | yes, 46 sections | section-specific planet/house/yoga/dosha/transit/dasha/remedy scopes | six bounded groups | yes | generic renderer | implemented; live depth/latency evaluation required |

## H–J. Verification and offline artifacts

The offline generator writes JSON and PDF for all six categories to `/private/tmp/navagraha-universal-report-samples`. It makes zero paid calls. The prose is deterministic fixture prose and is explicitly watermarked for Career; it proves orchestration, validation, completeness, persistence shape and PDF renderability, not GPT-4o writing quality or production reliability.

| Category | Sections | PDF pages | Simulated calls | Simulated cost |
|---|---:|---:|---:|---:|
| Career | 9 including appendix/glossary | 9 | 5 | $0.042392 |
| Marriage | 8 | 5 | 1 | $0.017565 |
| Finance | 8 | 6 | 1 | $0.019818 |
| Year Ahead | 8 | 6 | 1 | $0.023388 |
| Life | 6 | 5 | 1 | $0.026925 |
| Complete Life | 46 | 18 | 6 | $0.123772 |

Automated coverage includes every registry product and renderer, seven synthetic Career charts, different natal configurations, historical dates in the existing canonical suite, exact/approximate policies, transit evidence, scoped long-report evidence, malformed/truncated/provider-error behavior, targeted correction success/failure, unsupported evidence, deterministic remedies, deadlines, budget exhaustion, persistent-worker terminal behavior, unsupported scripts and all pre-existing payment/refund/report compatibility tests.

Pre-production verification used an isolated PostgreSQL 14 cluster at `127.0.0.1:55439` with a disposable database. The 12 previously skipped database files passed all 116 tests serially. Six additional database tests verify atomic debit/order/job creation, insufficient-funds rollback, concurrent duplicate submission, `FOR UPDATE SKIP LOCKED` worker exclusion, queued-job pickup after worker absence, stale in-flight failure/refund, delivery-versus-refund races, and idempotent finalisation. Route tests verify all six products enter the universal queue only when both the feature flag and verified-email allowlist match, while all six remain on the legacy path with the flag disabled.

Final local result after this verification: TypeScript check passed; production build passed; Vitest passed 110 files / 1,705 tests with no skipped database tests. The generic renderer was instrumented to prove that every configured heading is drawn, all text stays inside the page footer boundary, long paragraphs and place names paginate, missing birth fields render, and unsupported scripts are rejected. Text extraction from the six offline PDFs found every required heading and no empty page.

The manifest figures below are simulated usage from deterministic fixture responses and must not be presented as live-provider metrics. Live GPT-4o results follow.

### Live GPT-4o acceptance (2026-10-19, non-production key, synthetic charts, no orders)

Run with a local runner outside the repository against this branch: Career on the synthetic Kolkata fixture, the others on 1990-08-15 06:30 Bengaluru (exact). Cost is provider-reported usage at $2.50/$10 per million tokens.

| Category | Result | Calls | Corrections | Input / output tokens | Cost | Latency | Sections / PDF pages |
|---|---|---:|---:|---:|---:|---:|---:|
| Career | pass (2 of 3 runs; one run failed closed on a weakly supported field recommendation) | 7 | 2 | 8,932 / 3,824 | $0.061 | 15 s | 9 / 10 |
| Marriage | pass | 4 | 2 | 11,126 / 5,177 | $0.080 | 39 s | 8 / 7 |
| Finance | pass | 5 | 3 | 15,817 / 6,862 | $0.108 | 54 s | 8 / 7 |
| Year Ahead | pass | 4 | 2 | 18,695 / 5,234 | $0.099 | 39 s | 8 / 6 |
| Life Reading | pass | 3 | 1 | 13,186 / 3,570 | $0.069 | 31 s | 6 / 6 |
| Complete Life | **fails** (first group truncated at the 3,000-token allowance) | 2 | 1 | 13,882 / 3,524 | $0.070 | 26 s | — |

Defects the first live run found and this branch fixes: GPT-4o wrote 55–90-word sections against 75–90-word minimums, so every generic report failed (the prompt now asks for three paragraphs of three to four sentences toward a `targetWords` of 1.5× the minimum; generic products send four sections per call, Life three, with two correction rounds as Career has); timing sections lost the Vimshottari dates to the 36-item evidence cap (they now select period evidence explicitly); evidence ids and numeric citation markers appeared in the prose (now a blocking problem); the guard missed "Venus's debilitation in Cancer" and "located in both the 2nd and 11th houses" (noun-form dignity and plural/verb-led house claims are now checked); Markdown `**` reached the PDF; chart and appendix headings could sit alone at a page foot.

### Five-report readiness (2026-10-19, after 80310e8)

Complete Life is not released to the engine (`UNIVERSAL_RELEASED_CATEGORIES` in `reportEngine/feature.ts`): the order route and the worker keep it on the legacy generator for every account, flag or not; its configuration and code are untouched. Changes for the five released reports:

- Career: a sentence that ranks a weakly supported field low ("least align", "challenging to pursue") is no longer read as recommending it; "leadership" no longer counts as ranking two fields; a paragraph up to a quarter over its editorial word target is an advisory, not a refund. Factual checks are unchanged.
- Repetition: each section gets up to three lead facts dealt round-robin (no fact leads two sections); later call groups are told what earlier sections explained; repeated sentences across sections and chart-free paragraphs are measured as editorial warnings.
- Thin evidence: a section whose life areas all have the verdict "Insufficient evidence" has a 60-word floor and is told to say so plainly. About 1 chart in 5 has this verdict for relationships (24 of 120 random charts), so a Marriage report for those charts is mostly a qualified "cannot tell".
- Year Ahead: "Best & Cautious Months" is now "Key Months Ahead", built only from dated evidence — the slower planets' sign changes over the next 12 months read from the Moon sign by the Gochara rule, and Antardasha changes at the engine's dates. A dated sign-change claim must match a supplied one; a dated planet-in-sign claim is exempted from the birth-chart check only when it matches. The catalogue description no longer promises month-by-month predictions.
- Remedies: only for planets that rule the report's houses, signify its subject or lead its running periods (Year Ahead), from the chart's functional remedies; birth-star practices only in the Life Reading; never gemstones; none from lordship with an approximate time; none for Career. Catalogue copy no longer promises remedies to every buyer.
- Markdown headings are stripped from delivered prose.

Live GPT-4o sample (non-production key, synthetic charts): 41 reports on an intermediate build passed 38 (career 6/8, marriage 8/8, finance 8/8, year ahead 7/8, life 9/9); $3.30 total, highest single report $0.131, average 13–40 s. A 61-report run on the near-final build was cut short when the evaluation key ran out of credit (HTTP 429 "no credits remaining"): of the 17 reports that ran before that, 14 passed. The three failures (a dated transit read as a birth placement, a numbered list read as a citation marker, a Career vocabulary-scope rejection) led to the last two fixes, which are covered by unit tests but not yet measured live. The 95% target is **not demonstrated**; re-run `run-sample` (61 reports, about $5) once the key has credit.

End to end against Postgres (`tests/unit/universal-report-e2e.db.test.ts`, offline model replies): for each of the five reports, catalogue → order route → one debit → durable job → worker → engine validation → stored delivery → reopening → PDF; a terminal failure is refunded exactly once; Complete Life and non-allow-listed accounts stay on the legacy generators. Life Reading has no seeded catalogue row, so it is not purchasable until an admin adds one.

Complete Life cannot be delivered under the $0.25 ceiling as designed: at the depth that passes validation its six first-pass calls alone cost about $0.30 in provider usage, and the byte-based reservation (~$0.09 per call) refuses calls before that. It needs a product decision (fewer or shorter sections, a smaller evidence payload, a tighter input estimate, or a different ceiling) before it can be enabled.

Remaining editorial weaknesses in passing reports: the same few strongest facts recur across sections (the editorial check is per section only); Marriage and Year Ahead relationship sections are thin where the engine's verdict is "Insufficient evidence"; Best & Cautious Months names no months because no month-level evidence exists; the same chart remedies are appended to every product.

## K. Cost and latency policy

`gpt-4o` is costed at $2.50 per million input tokens and $10 per million output tokens, matching the [published GPT-4o API rates](https://developers.openai.com/api/docs/models/gpt-4o). Every universal request first reserves a conservative worst case using UTF-8 byte count as an upper bound for input tokens plus its complete output allowance. A call is refused before dispatch if spent + reserved would exceed 250,000 microdollars. Missing usage is charged at the full reservation. Provider usage settles the reservation; transport, format and targeted correction calls share the same ledger. No fallback call exists outside it.

Offline duration is not representative of provider latency. The unchanged six-minute report deadline and 120-second per-call timeout remain. Metrics persist inside successful universal report content and record calls, transport/format retries, corrections, cost, duration and editorial warnings. Career continues to expose its existing richer metrics callback.

## L. Remaining risks and limitations

1. Live GPT-4o evaluation (section J) covers one chart per product and a few runs each; Complete Life fails under the $0.25 ceiling and is a production blocker for that product. Career passed 2 of 3 runs.
2. In-flight provider work is not replayed after a process crash because spend cannot be proved; it safely refunds after the existing stale timeout. Queued jobs do survive restarts. Full mid-call resumption would require persistent per-call spend reservations/checkpoints.
3. The generic renderer is preserved rather than redesigned. Automated bounds checks, text extraction and local page rasterisation pass, but the in-app browser connection was unavailable. Complete Life still needs browser review with actual GPT prose before rollout.
4. Universal metrics are stored with successful content; failed-attempt aggregate analytics are logged but do not yet have a dedicated reporting table.
5. The interpretation layer deliberately reuses only existing deterministic rules. Additional practitioner-reviewed rules need identifiers, applicability tests and sources before being added.
6. English/Latin-script PDF output is explicit. Unsupported scripts are rejected visibly; localization is not silently simulated.
7. No production reliability claim is made and the engine remains doubly gated, off and empty-allowlist by default.

## M. Controlled rollout and rollback

1. Keep `FEATURE_UNIVERSAL_REPORT_ENGINE` false and `UNIVERSAL_REPORT_ENGINE_ALLOWLIST` empty through review and migration verification.
2. Deploy code/schema with the gate off; verify legacy orders, historical report opening/downloading, health and migrations.
3. Enable only in a non-production environment with a non-production OpenAI credential. Run the six-product matrix and inspect actual narratives/PDFs/cost/latency.
4. In production, enable the flag only with one verified authorized test email in `UNIVERSAL_REPORT_ENGINE_ALLOWLIST`; keep the legacy path for everyone else.
5. Review generation quality, evidence links, all dates, PDFs, metrics, payment and refunds. Expand the allowlist only after explicit approval.
6. Roll back instantly by disabling the flag. Existing universal reports remain readable because the stored payload and PDF adapters are backward-compatible. Queued jobs should be drained or explicitly failed/refunded before removing worker code.

## Public architectural references

Only public concepts were used; no external report prose, private API, or source code was copied. The design follows the publicly documented separation of calculation from interpretation and report-ready signals described by [Modern Panditji](https://modernpanditji.com/methodology) and [PanditOne](https://panditone.com/learn/engine-method/panditone-engine-overview), the curated corpus/reproducibility emphasis described by [Melooha](https://www.melooha.com/blog/gen-ai---the-corpus-technology), and the computation/product/application separation visible in [OpenJyotish](https://github.com/velteyn/OpenJyotish) and [DaivAI](https://github.com/master12coder/daiv-ai). OpenJyotish is GPL-licensed, so its implementation was treated as reference material only and not incorporated.
