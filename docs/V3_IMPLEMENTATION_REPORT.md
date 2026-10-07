# Navagraha V3 Implementation Report

Branch `navagraha-v3/full-build`, from `main` at `9eb9152` (P0 merged via PR #61). Not merged or deployed.

## Architecture

```
Birth details (date, time, place / coordinates, optional IANA zone or UTC offset, time accuracy)
  → Birth Resolver            birthResolver.ts  (coordinates → zone → historical offset → UTC)
  → Canonical Chart Engine    canonical/compute.ts  (Swiss Ephemeris, Lahiri, whole-sign)
  → CanonicalChart            shared/v3/canonical.ts  (strict, versioned schema)
  → Jyotish rule layers       vargas · Vimshottari/Yogini/Chara · dignity · partial Shadbala ·
                              Ashtakavarga · yogas · doshas · Jaimini karakas
  → Evidence Engine           evidence/engine.ts  (9 life domains, rule-encoded, provenance)
  → Resolution Engine         evidence/resolution.ts  (verdict + confidence; contradictions kept)
  → Timeline                  evidence/timeline.ts  (canonical Vimshottari periods)
  → Question Router + AI      agents/askKundli.ts  (explains the evidence; never calculates)
  → Kundli V3 · Evidence Sheet · Ask Your Kundli · Life Timeline · Professional Jyotish
```

There is one natal calculation. The consumer Kundli, transits, matching, Panchang, Prashna, reports, the AI and the professional tool all read the same CanonicalChart, or the same Swiss/Lahiri positions for moment charts. The previous Keplerian engine (`planets.ts`, `core.ts`) and the separate `swissChart.ts` path are deleted.

## Calculation engine

| Item | V3 behaviour |
|---|---|
| Ephemeris | Swiss Ephemeris (`sweph` 2.10.03), Moshier analytic mode (no data files). Every call checks the returned flags and fails loudly if Swiss falls back to another ephemeris. |
| Ayanamsa | Lahiri (`SE_SIDM_LAHIRI`). The chart stores the ayanamsa value (e.g. 23.8532° at J2000). |
| Nodes | Mean lunar node; Ketu = Rahu + 180°. |
| House system | Whole-sign from the sidereal Lagna. The MC is computed and used for Dig Bala. |
| Time zones | Coordinates → IANA zone (`geo-tz/all`, which keeps zones whose pre-1970 history differs), or an explicit zone. The offset comes from the tz database (e.g. India 1942–45 +06:30, Madras time +05:21:10, US/UK/AU DST, Nepal 1986). DST gaps are rejected; folds need an explicit `utcOffset`. There is no global IST assumption. |
| Birth-time accuracy | `exact` or `approximate`, propagated into `uncertainty`. With an approximate time the Lagna, houses and time-sensitive vargas are flagged unreliable, the Moon's sign/nakshatra stability across the birth date is reported, and Lagna-dependent evidence is excluded from verdicts. |
| Vargas | D1, D3, D4, D7, D9, D10, D12, D60, each with an independently written rule test. |
| Dasha | Vimshottari (365.25-day years). The birth Mahadasha is placed at its true start, which **fixes a pre-V3 bug** that shifted every Antardasha in the first Mahadasha. Also Yogini, and Chara (Jaimini, explicitly `verified: false` because the count rule differs by lineage). |
| Shadbala | **Partial**: Uchcha, Dig and Naisargika bala only, with exact classical formulas. No total Rupas, because the remaining components are not implemented. The Rust Shadbala was heuristic and is retired. |
| Ashtakavarga | BAV + SAV (canonical 337-bindu tables). |
| Yogas / doshas | The existing rule set: Kemadruma cancellation tightened, frequent combinations down-weighted in evidence, wording de-fearified. Dosha rules state their limits (e.g. Mangal cancellation conditions are not evaluated). |
| Prashna | Ported from Rust to TypeScript on Swiss astronomy, with the real sidereal Lagna, sunrise-based Vedic weekday and planetary hora (Swiss `rise_trans`), and the standard Arudha Lagna rule. The yes/no indicator is labelled a Navagraha convention. |

**Rust decision.** `/calculate` stays retired. Its vargas mixed tropical D9, sidereal D1 and a fixed 24° offset, and its Shadbala was heuristic (invented Sthana values, a fake lunar phase, 7th-house-only Drik bala). The canonical TypeScript engine owns all of it now, so re-enabling Rust would only reintroduce a second, conflicting implementation. `callAstroEngine` remains fail-closed, with a regression test. `/prashna` is no longer called: it used a mean-longitude Moon and a fixed 24° ayanamsa. `/synastry`, a koota rule engine fed by canonical nakshatra/sign, and `/remediation` are unchanged.

## CanonicalChart

`shared/v3/canonical.ts` contains:

- `meta`: schema `navagraha.canonical-chart` v3.0.0, engine `navagraha-core` 3.0.0, ephemeris and version, ayanamsa and its value, zodiac, house system, node type, Julian day (UT), `calculatedAt`.
- `birth`: local date and time (with seconds), place, coordinates, timezone, UTC offset, birth instant (UTC), time accuracy, and where the coordinates and zone came from.
- `uncertainty`; `ascendant`; `midheaven`; `planets[9]` (longitude, latitude, speed, retrograde, sign, degree, whole-sign house, nakshatra with lord and pada); `houses[12]` (sign, lord, lord's house, occupants); `aspects`; `vargas`.
- `strength` (dignities, Ashtakavarga, partial Shadbala); `yogas`; `doshas[4]` (each with its rule); `dashas` (Vimshottari with Antardashas, Yogini, Chara); `jaimini`.

The schema is strict: unknown keys, out-of-range longitudes and the wrong number of planets, houses or periods all throw. **Versioning:** a stored chart is current only if it validates against this schema version. Anything else goes through the legacy-upgrade path.

**Storage:** the chart lives in the existing `kundlis.chartData` JSON, so there is **no database migration**. `chartData` keeps the legacy shape as a pure projection of the canonical chart (`canonical/legacy.ts`), so existing UI, reports and PDFs keep working.

## Golden-chart regression suite

- **`golden-astronomy.test.ts`** (187 tests over 44 charts). 32 base births span 1943–2021, 24 time zones, both hemispheres, latitudes up to 64° and the equator, DST, India war time, Nepal's 1986 change, seconds, a leap day and an approximate time. 12 generated cases sit 25 minutes either side of a Moon nakshatra, sign and pada boundary and 2 minutes either side of an Ascendant change, plus Saturn/Jupiter/Mercury/Mars retrograde loops. The suite tests the time zone, offset and UTC instant; all nine longitudes plus the Ascendant and MC (30″ tolerance); sign, house, nakshatra, pada, retrograde, D9 and D10 (asserted only ≥0.03° from a division edge); and the Mahadasha sequence and boundaries.
- **Provenance.** Expected values come from `scripts/golden/reference.ts`, which shares no code with `server/`:
  - `astronomy-engine` (VSOP87/ELP), rotated to the J2000 ecliptic;
  - the Lahiri constant, cross-checked against Spica ≈ 180°;
  - Meeus' mean node;
  - the Ascendant/MC from IAU-1982 GMST and Laskar obliquity;
  - independently written D9/D10/Vimshottari rules.

  The worst observed engine-vs-reference gap is about 13″. While building the suite, it caught a frame bug in the reference itself (true-of-date vs J2000 ecliptic) and a real resolver bug: the default `geo-tz` dataset merged pre-1970 zone histories. Both are fixed. See `tests/golden/README.md`.
- **`golden-jyotish-rules.test.ts`** (33 tests) is kept separate from astronomy. It covers every varga rule (D9/D10 swept across the zodiac against the independent rules), Vimshottari/Yogini including the Antardasha fix, the partial-Shadbala components, selected yogas (including the Kemadruma fix) and doshas.

## Evidence engine

Nine domains: career, wealth, relationships, leadership, property/home, foreign/travel, education, children, spirituality. **Health is deliberately excluded** from automated verdicts, to avoid medical inference.

For each domain's houses the engine evaluates:
- the house lord's placement and dignity;
- occupants (benefic vs malefic, with the upachaya rule);
- Jupiter/Saturn/Mars aspects;
- the house's SAV bindus (symmetric bands around the ~28 average);
- the lord's Dig Bala.

It then adds the lord's dignity and vargottama status in the domain varga (D4/D7/D9/D10), the natural significators, the Jaimini karaka (AmK/DK/PK/AK), mapped yogas (one per yoga family, weakened when formed in a dusthana, weak for very common combinations) and domain-specific rules (9th–12th lord link, 11th vs 12th bindus, Mangal flag as a mild convention, Jupiter in trine from the Moon). Running Mahadasha/Antardasha lords engage a domain when they rule, occupy or signify it.

Every item carries `rule`, `explanation` (the chart-specific fact), `source`, `provenance` (classical principle / derived rule / modern convention, with no chapter or verse claims), `strength` and `requiresBirthTime`/`usable`.

## Resolution engine

Weights are strong 3, moderate 2, weak 1, over usable items only, and the balance is r = (support − conflict)/(support + conflict).

| Verdict | Condition |
|---|---|
| Exceptional | r ≥ 0.75, support ≥ 18, ≥ 5 independent supporting sources |
| Very Strong | r ≥ 0.55, ≥ 4 sources |
| Strong | r ≥ 0.25 |
| Mixed | −0.25 < r < 0.25, or fewer than 3 usable indicators |
| Challenging | r ≤ −0.25 |
| Very Challenging | r ≤ −0.55, ≥ 3 sources |

**Confidence** is High with ≥ 6 usable items, ≥ 3 independent winning sources and a losing side ≤ 40% of the winning one. It is Low with fewer than 4 items, a near-zero balance or an approximate time; otherwise Medium. Contradictions stay visible (`conflicting`, `contradictedBy`), and the conclusion is built from a deterministic template.

**Calibration.** Over the 44 golden charts × 9 domains, the distribution is Strong 146, Mixed 162, Very Strong 26, Challenging 49, Very Challenging 12, Exceptional 0. It is still somewhat positive, especially for career, because the 10th is an upachaya house. These thresholds are engineering choices, not an astrologer-validated model.

## AI architecture

- **Router.** Deterministic: it maps questions to domains, intent (verdict, timing, planet, overview), planets (including Hindi names) and depth.
- **Simple path.** An evidence packet (authoritative chart facts, verdicts with supporting and counter-evidence, dasha timing, transits) goes to one `gpt-4o-mini` explanation call, with rules to keep verdicts, never compute placements, use no citations and observe the safety list.
- **Deep path.** Triggered by "detailed/complete/in-depth" questions, three or more domains, or `depth: 'deep'`. The council (5 agents, Jyotishi, Ethicist) receives only the packet. Its prompts were rewritten: no invented confidence percentages, no "never hedge" instruction, no claims about uncomputed Pushkar degrees.
- **Hallucination boundary.** Planet-in-sign and planet-in-house claims are checked against the chart (case-insensitive). The answer is regenerated once, then replaced by a deterministic answer built from the evidence. Without an OpenAI key the deterministic answer is returned.
- **Chart availability.** With no chart the AI makes no personal claims. A chosen chart that can't be recalculated gets an explanation rather than a guess.
- **History.** Prior turns come from the stored session, never from client-supplied history.
- Reports, interpretation, the life report and briefs receive calculation provenance, birth-time accuracy, today's running period and the evidence verdicts. The stored dasha `status` is recomputed from dates.

## Consumer experience

- **Kundli V3 (`KundliView`).** "YOUR KUNDLI — Leo Lagna · Taurus Moon · Cancer Sun", "Calculated using Swiss Ephemeris · Lahiri Ayanamsa · Asia/Kolkata (UTC+05:30)", and a notice for recalculated or limited charts.
  - **Your Chart at a Glance:** nine cards, each with verdict, counts, confidence and "Why →".
  - **Evidence Sheet:** evolved `AIInsightSheet`, with domain and planet modes. Evidence is grouped as 10th House, 10th Lord, D10, Shadbala, Ashtakavarga, Current Dasha and so on, with ✓/✗, rule, provenance and strength, plus a conclusion, confidence, a confirmed-by matrix, items set aside for approximate time, and an "Ask about this" deep link.
  - **Life Timeline:** Insights tab; clickable Mahadashas with themes, engaged areas, supporting/conflicting factors, confidence, "why this period matters", and Antardashas for the current period.
  - `CalculationInfo` shows the real calculation metadata.
- **Ask Your Kundli.** Renamed AI page, with deep links (`?q=&kundliId=`, owned charts only) and an evidence summary under each answer.
- **Removed fabricated content:** "BPHS Chapter 32" and "Based on 3 strong indicators" (evidence sheet); the hard-coded planet insight; the Aries/Taurus badge fallbacks; the static "Verified" badge; Home's fixed "Mars Mahadasha / Saturn transit" and "Saturn turns benefic on Thursday"; and Remedies' universal Mangal Dosha puja and Red Coral. Home now shows the user's real running periods and Sade Sati status. Remedies come from the chart's functional remedies, with gemstones always "consult first".
- Browser-verified locally (production build, real Postgres): 12/12 V3 screen checks and 9/9 approximate-time disclosure checks (guest form → preview → saved reload).

## Professional mode

`jyotishEngine.computeJyotishChart` is now a projection of the same CanonicalChart. A test proves it has identical longitudes, signs, houses and nakshatras to the consumer chart, and its birth time is read in the local zone rather than IST. Parashar, K.N. Rao and Kamakhya prompts receive:
- the shared deterministic evidence graph;
- calculation provenance;
- birth-time accuracy;
- a rule that traditions may weigh evidence differently but never alter facts or cite chapters/verses.

Profiles are validated by the canonical engine at creation, and birth-input errors are 400s.

## Migration

Pre-V3 saved charts are upgraded lazily on owner access (`canonical/upgrade.ts`, called through a single-flight `currentChart()` after the ownership check):
- **Recalculation:** deterministic, from the stored date, time and coordinates in the birthplace's historical zone (carrying forward any supplied zone or offset). The old `chartData` is kept verbatim as `legacySnapshot`, which makes the change reversible, and a migration note is shown in the UI (e.g. "the earlier version assumed Indian Standard Time").
- **No coordinates or invalid time:** marked `limited`, never guessed.
- **Failure:** an unexpected upgrade error falls back to the stored chart.

There are no schema migrations.

## Security

- Ownership is enforced, with the real auth guard tested, on saved-chart read, transits, **insights**, interpretation, AI chat (explicit and default chart), report orders and feedback.
- Legacy upgrades run only after ownership is verified; a different user cannot trigger them.
- The guest insights endpoint accepts only a schema-valid canonical chart, persists nothing, calls no AI and is rate-limited.
- Explicit birth details are validated before any side effect, as in P0.
- No coordinate, time, epoch or city fallbacks. The audit replaced `sidereal[p] ?? 0` with a strict accessor.
- Client-supplied chat history is no longer trusted.
- AI deep links accept only charts the user owns.

## Tests

| Suite | Result |
|---|---|
| Unit (vitest, `tests/unit`) | **510 passed / 0 failed, 27 files** (main at `9eb9152`: 208) |
| — of which golden astronomy | 187 passed (44 charts) |
| — of which golden Jyotish rules | 33 passed |
| — of which V3 resolver / evidence / routes / Ask Your Kundli / pro / legacy / review fixes / UI guards | 30 / 13 / 17 / 18 / 5 / 5 / 5 / 3 passed |
| Integration (`tests/integration`, excluded by the vitest config; run with an equivalent config) | 12 passed / 0 failed |
| Rust (`cargo test`, astro-engine-rs) | Builds; 0 tests exist in the crate. Rust calculation is retired, so no Rust test gates V3. |
| Typecheck (`npm run check` / `tsc`) | Passed |
| Production build (`npm run build`) | Passed (existing large-chunk warning) |
| Lint | No lint script configured |
| `git diff --check` | Passed |
| Browser (local, Playwright) | 12/12 V3 screens; 9/9 approximate-time disclosure |

## Files changed (by subsystem)

- **Calculation core.** Added `birthResolver.ts`, `canonical/{compute,shadbala,legacy,upgrade}.ts`, `prashna.ts`, `errors.ts` and `lon.ts`. Rewired `index.ts`, `jyotishEngine.ts` and `panchang.ts`. Fixed `dasha.ts` and `yogas.ts`; added vargas in `vedic.ts`. Deleted `planets.ts`, `core.ts` and `swissChart.ts`.
- **Intelligence.** `evidence/{engine,resolution,timeline,insights}.ts`; shared types in `shared/v3/{canonical,evidence}.ts`.
- **AI.** `agents/askKundli.ts` (new); `agents/{orchestrator,prompts}.ts` and `jyotishAiService.ts` rewritten for grounding; `aiAstrologerService.ts` gets canonical context.
- **API.** `routes.ts`: insights endpoints, the chat path, `currentChart`, Prashna, error mapping, profile validation. `storage.ts`: `updateKundliChart`. `birthDetails.ts`: timezone/utcOffset. `rustChartAdapter.ts` and the Prashna client removed.
- **UI.** `KundliView`, `AIAstrologer`, `Home`, `Remedies`, `AIInsightSheet`, `ActiveInfluenceCard`; new `components/v3/*`.
- **Tests and tooling.** Golden suite (`scripts/golden/*`, `tests/golden/*`), nine V3 test files, P0 tests updated to the canonical contract.
- **Docs.** `CLAUDE.md` (architecture, inventory, rules), this report.
- **Dependencies.** `geo-tz` (runtime), `astronomy-engine` (dev; golden reference only).

## Known limitations

1. **Evidence rules and thresholds.** These are deterministic encodings of textbook principles plus engineering thresholds. They are not validated against expert-astrologer judgments or outcome data, and the verdict distribution leans positive.
2. **Golden-suite independence.** The ephemeris is independent, but the Lahiri constant is definitional (cross-checked against Spica). There is no cross-check against Jagannatha Hora or JPL outputs; there's no network access to them here.
3. **Partial Shadbala.** Three of six components; Kala, Chesta, Drik and the full Sthana bala are not implemented.
4. **Chara Dasha** is unverified (lineage-dependent) and is not used in consumer evidence.
5. **Whole-sign houses only.** Bhava Chalit is the equal-from-Ascendant overlay; no Placidus or Sripati.
6. **Dosha rules are simplified.** Mangal cancellation and Pitru conditions are not fully evaluated, and the evidence engine says so.
7. **Consistency guard coverage.** It catches sign and house contradictions only; other hallucinations (invented yogas, certainty language) rely on prompt rules and the ethicist.
8. **Panchang** still uses fixed IST and 06:00/18:00 sunrise/sunset (a documented caveat). Prashna uses real sunrise.
9. **Legacy upgrades.** They change user-visible placements for older charts, especially non-India births previously read as IST. The change is reversible (`legacySnapshot`) and disclosed, but not yet exercised on production data.
10. **Dependency footprint.** `geo-tz/all` adds about 74 MB to `node_modules`.

## Deferred

Full Shadbala; Chara Dasha verification; Kaksha, Pushkara and other special degrees; additional vargas (D2, D16, D20, D24, D27, D30, D40, D45); alternative house systems; expert calibration of evidence weights; a health domain with clinical-safety review; Rust crate cleanup (dead `/calculate`, `/prashna` and WASM stub); localisation of evidence text; caching insights (they're cheap: 1.5–6 ms per chart).

## PRs / commits

Branch `navagraha-v3/full-build` (PR link in the PR description):

| Commit | Summary |
|---|---|
| `725ef58` | Birth resolver |
| `7b121e6` | CanonicalChart engine and golden suite |
| `b039658` | All consumers on canonical; Rust calculation retired |
| `97de0e0` | Evidence, resolution, timeline and insights API |
| `ab8f480` | Ask Your Kundli and AI routing |
| `0791280` | Kundli V3 UI |
| `c1059f8` | Removed hard-coded astrology and 0° fallbacks |
| `0d0da55` | Dasha status from dates, throttling, date round-trip |
| `89320c6` | Code-review fixes |

## Production readiness: **NO-GO**

The branch is ready for review and staging, not production. Blocking issues:

1. **P0 production verification is still OPEN.** The Render backend commit was never confirmed, because the environment had no Render access. V3 should not stack on an unverified deployment pipeline.
2. **Legacy upgrades write to production data on first owner access.** They are reversible, but need a database backup, staging rehearsal on a production snapshot, and sign-off on the user-visible changes (especially non-India charts that were previously read as IST).
3. **The evidence and verdict engine needs expert review.** A qualified Jyotish reviewer should audit the rules, weights and verdict calibration before verdicts are shown to customers.
4. **Live integration is unexercised.** Real OpenAI responses through the new prompts and guard, Google geocoding, and the native `sweph`/`geo-tz` install on Render have not been run in this environment.
5. **Dependency and image size.** `geo-tz/all` must be confirmed within Render's build and image limits.
