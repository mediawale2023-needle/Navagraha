# Navagraha V3 Implementation Report

Branch `navagraha-v3/full-build` (PR #62, draft), from `main` at `9eb9152` (P0 merged via PR #61). Not merged or deployed. The **Launch sprint** sections below supersede earlier statements where they differ.

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
| Panchang | Limbs at the place's actual sunrise (Swiss `rise_trans`, disc centre, standard refraction) for the **local civil date in the place's IANA zone**; Rahu Kaal / Gulika / Yamaganda divide the real sunrise→sunset day. Polar day/night is refused, not invented. Without a location the response says it is the New Delhi default. |
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

It then adds the lord's dignity and vargottama status in the domain varga (D4/D7/D9/D10), the natural significators, the Jaimini karaka (AmK/DK/PK/AK), mapped yogas (one per yoga family, weakened when formed in a dusthana) and domain-specific rules (9th–12th lord link, 11th vs 12th bindus, Mangal flag as a mild convention, Jupiter in trine from the Moon). Running Mahadasha/Antardasha lords engage a domain when they rule, occupy or signify it.

Every item carries `rule`, `explanation` (the chart-specific fact), `source`, `provenance` (classical principle / derived rule / modern convention, with no chapter or verse claims), `strength`, `requiresBirthTime`/`usable` and **`tier`**:

- **core** — textbook Parashari rules on verified calculations (D1 lords, dignity, occupants, aspects, SAV bands, D4/D7/D9/D10 lord dignity, vargottama, uncommon yogas, Vimshottari periods). **Only core items decide a verdict.**
- **experimental** — shown for transparency, never counted: Jaimini karakas (second system), partial Shadbala (Dig Bala), modern conventions (Mangal house rule, Rahu/Moon in 9th/12th), Navagraha heuristics (9th–12th link, 11th vs 12th bindus, Jupiter trine Moon, Ketu in 12th), and yogas present in a third or more of charts (measured on the 44 golden charts: Raja 68%, Budha-Aditya 52%, Vipreeta 43%, Gajakesari 36%), which cannot discriminate.

With an approximate birth time every Lagna/house/lord/house-yoga/varga item is **excluded** (not down-weighted), and a running Mahadasha/Antardasha is used only if it is the same for every possible birth moment on the birth date (`dashaTimingStable`: Moon advanced at its birth speed, Vimshottari recomputed hourly across the date).

## Resolution engine

Weights are strong 3, moderate 2, weak 1, over usable **core** items only; balance r = (support − conflict)/(support + conflict). Independent sources are the distinct sources among items of at least moderate strength: a weak item adds weight but never "confirms".

| Verdict | Condition |
|---|---|
| Insufficient evidence | fewer than 4 core items, or total weight < 6 |
| Exceptional | r ≥ 0.75, support ≥ 18, ≥ 5 independent supporting sources |
| Very Strong | r ≥ 0.55, ≥ 3 independent supporting sources |
| Strong | r ≥ 0.25 |
| Mixed | −0.25 < r < 0.25 |
| Challenging | r ≤ −0.25 |
| Very Challenging | r ≤ −0.55, ≥ 3 independent conflicting sources (mirror of Very Strong) |

**Confidence** is High with ≥ 6 core items, ≥ 3 independent winning sources and a losing side ≤ 40% of the winning one; Low with fewer than 5 core items, a near-zero balance, Insufficient evidence or an approximate time; otherwise Medium. Contradictions stay visible (`conflicting`, `contradictedBy`), experimental items are returned separately (`experimental`), and the conclusion is a deterministic template.

**Calibration** (`scripts/calibration/distribution.ts`; guardrails asserted in `v3-evidence.test.ts`), 44 golden charts × 9 domains = 396 readings, as of 2026-10-07:

| | Exceptional | Very Strong | Strong | Mixed | Challenging | Very Challenging | Insufficient |
|---|---|---|---|---|---|---|---|
| Before sprint | 0 | 26 | 146 | 162 | 49 | 12 | — |
| **After sprint** | **0** | **17** | **121** | **135** | **76** | **3** | **44** |

| Domain (after) | VS | S | Mixed | Ch | VC | Insufficient | positive share |
|---|---|---|---|---|---|---|---|
| Career | 6 | 24 | 7 | 2 | 0 | 5 | **68% (flagged)** |
| Wealth | 4 | 18 | 17 | 4 | 0 | 1 | 50% |
| Relationships | 1 | 6 | 13 | 10 | 1 | 13 | 16% |
| Leadership | 3 | 23 | 12 | 5 | 0 | 1 | 59% |
| Property & Home | 2 | 11 | 15 | 10 | 0 | 6 | 30% |
| Foreign & Travel | 0 | 13 | 18 | 10 | 0 | 3 | 30% |
| Education | 0 | 5 | 19 | 17 | 1 | 2 | 11% |
| Children | 1 | 8 | 14 | 9 | 1 | 11 | 20% |
| Spirituality | 0 | 13 | 20 | 9 | 0 | 2 | 30% |

Overall positive share fell from 43% to 35%; Exceptional is never produced. **Flagged skew:** Career (and to a lesser degree Leadership) remains positive-leaning because the 10th is both a kendra and an upachaya house (every occupant counts in its favour classically) and Sarvashtakavarga is structurally high in the 10th/11th. This is left visible rather than tuned away; it needs expert review. Relationships and Children often return Insufficient evidence because fewer core rules apply to a single house. Guardrails: Exceptional = 0, Very Strong ≤ 6%, overall positive < 50%, negative > 10%, no domain > 70% one-sided, Insufficient ≤ 35% per domain.

## AI architecture

- **Router.** Deterministic: it maps questions to domains, intent (verdict, timing, planet, overview), planets (including Hindi names) and depth.
- **Simple path.** An evidence packet (authoritative chart facts, verdicts with supporting and counter-evidence, dasha timing, transits) goes to one `gpt-4o-mini` explanation call, with rules to keep verdicts, never compute placements, use no citations and observe the safety list.
- **Deep path.** Triggered by "detailed/complete/in-depth" questions, three or more domains, or `depth: 'deep'`. **Gated off by default (`FEATURE_AI_COUNCIL`)**: deep questions then use the guarded single explainer. When enabled, the council (5 agents, Jyotishi, Ethicist) receives only the packet, never a running period derived from raw dasha JSON; its prompts forbid certainty words, invented confidence, uncomputed special degrees, and Lagna/house/uncertain-period claims for approximate times.
- **Hallucination boundary (guard v2, `agents/answerGuard.ts`).** Draft → validate → regenerate once with the issues → validate → deterministic fallback. Validated against the chart: planet sign and house, Lagna sign, **named yogas** (catalogue incl. common inventions such as Lakshmi/Saraswati/Guru-Chandala), **doshas** incl. Sade Sati (negation-aware: a wrong denial is caught too), **running Mahadasha/Antardasha**, **nakshatra** and birth star, **retrograde**, **exaltation/debilitation/own sign**, **combustion**, dignity claims about the nodes (none are computed), and **years** not present in the supplied timing. With an approximate time any Lagna/house claim, an uncertain period or an uncertain Moon nakshatra is an issue, and the packet withholds those facts and all period dates. Transit sentences are not mistaken for natal claims. The deterministic fallback is itself validated against the guard on all 44 golden charts. Without an OpenAI key the deterministic answer is returned. Every answer carries an approximate-time disclosure when it applies.
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

**Parity** (`v3-pro-mode.test.ts`, five charts across India, US, UK, Nepal): longitude, sign, house, nakshatra, pada, retrograde, degree, Ascendant (sign, nakshatra, pada, longitude), D9 and D10 placements and the Vimshottari sequence and end dates are identical to the consumer chart. **Chara Dasha is withheld** from professional prompts unless `FEATURE_CHARA_DASHA=true` (the K.N. Rao method then cross-checks Vimshottari with Yogini only), and the pro UI labels the Chara table "unverified — not used by the AI". Session queries use a stored reading only if it belongs to the same profile and holds a current V3 chart (a cross-tenant `readingId` previously leaked another profile's chart); AI credit is consumed only after the chart resolves; calculation errors are 400s.

## Migration (legacy pre-V3 charts)

**Default: non-destructive.** A pre-V3 saved chart is recalculated **on read** (after the ownership check, single-flight per chart) and served as a V3 view; **the stored row is not modified**. `canonical/upgrade.ts` is pure: it returns either a full canonical chart (with a migration note, `legacySnapshot` = the original `chartData` and `legacyColumns` = the original zodiacSign/moonSign/ascendant/dashas/doshas/remedies) or an explicitly `limited` view; never a half-V3 record. Missing coordinates or an invalid stored time give `limited` (insights/transits answer 409), never a guess. An unexpected engine error serves the stored chart marked limited, never as V3.

**Optional persistence** (`V3_PERSIST_LEGACY_UPGRADES=true`, off by default): the upgrade is written with a single-statement **compare-and-swap** (`UPDATE … WHERE id = $1 AND chart_data = <the exact chartData it was computed from>`), so a concurrent writer or second instance can never be overwritten; a lost swap serves the recalculated view; limited charts are never written. Idempotent: an upgraded row is current and is not touched again.

Tests: normal, persistence, lost swap (concurrent change), parallel requests (one recalculation, ≤ 1 write), write failure, no coordinates, invalid time, already upgraded, stale canonical re-upgrade (keeps the first snapshot), purity (input unchanged) and exact rollback reconstruction; the local smoke run confirms the database row is unchanged after a legacy chart is opened.

**Before enabling persistence in production**

1. Back up: `pg_dump "$DATABASE_URL" -t kundlis -Fc -f kundlis-pre-v3-$(date +%F).dump` (or a provider snapshot), and record `select count(*) from kundlis where chart_data ? 'canonical'`.
2. Rehearse on a staging copy of production with the flag on; spot-check non-India charts (previously read as IST).

**Rollback** of persisted upgrades (exact; restores every overwritten column):

```sql
UPDATE kundlis SET
  chart_data  = chart_data->'legacySnapshot',
  zodiac_sign = chart_data->'legacyColumns'->>'zodiacSign',
  moon_sign   = chart_data->'legacyColumns'->>'moonSign',
  ascendant   = chart_data->'legacyColumns'->>'ascendant',
  dashas      = chart_data->'legacyColumns'->'dashas',
  doshas      = chart_data->'legacyColumns'->'doshas',
  remedies    = chart_data->'legacyColumns'->'remedies'
WHERE chart_data ? 'migration' AND chart_data ? 'legacySnapshot' AND chart_data ? 'legacyColumns';
```

Or restore the `kundlis` dump. Turning the flag off stops further writes immediately. There are no schema migrations.

## Security

- Ownership is enforced, with the real auth guard tested, on saved-chart read, transits, insights, interpretation, AI chat (explicit and default chart), report orders and feedback; every chart route returns 404 to another user and to malformed ids (SQL-ish, path-ish, 2000-char, NUL).
- Legacy recalculation runs only after ownership is verified.
- The guest insights endpoint accepts only a schema-valid canonical chart, persists nothing, calls no AI and is rate-limited (60/15 min/IP).
- **AI chat and interpretation are rate-limited per authenticated user** (60/15 min); before the sprint they had no limiter.
- Explicit birth details are validated before any side effect; a body `userId` is ignored; prior chat turns come from the stored session, never from the client.
- Pro session queries are tenant-isolated (profile and reading must belong to the astrologer's profile), and spend no credit on a 404 or invalid profile.
- No coordinate, time, epoch or city fallbacks; an unknown sign now throws instead of defaulting to Aries in transits.

## Dependencies and Render requirements

| Dependency | Role | Notes |
|---|---|---|
| `sweph` 2.10.3 (already on `main`) | Swiss Ephemeris, Moshier mode | Native N-API addon. Prebuilds: linux-x64 (glibc), linux-arm64, darwin-arm64, win32-x64. On **Alpine/musl** (the repo `Dockerfile`, `node:20-alpine`) it compiles from source in the builder stage (python3/make/g++ are installed). No ephemeris data files are needed. |
| `geo-tz` 8.x, **`geo-tz/all`** | coordinates → IANA zone, with pre-1970 history | Pure JS + data, **~71 MB** in `node_modules`. |
| Node ICU | historical offsets via `Intl` | Requires full ICU (the default in official Node ≥ 13 builds). |
| `astronomy-engine` | golden reference only | devDependency. |

**Boot self-check** (`astroEngine/selfCheck.ts`, run before routes are registered): Sun/Moon/ayanamsa at J2000 against the independent reference (30″), houses, Swiss sunrise, `geo-tz/all` (Nairobi → Africa/Nairobi, New Delhi → Asia/Kolkata) and ICU history (Asia/Kolkata 1943 = +06:30, New York summer = −04:00). On failure no route is registered, `/api/health` returns 503 with `astronomy self-check failed: …`, and the log says `FATAL astronomy self-check failed`. There is **no approximate-astronomy fallback** anywhere. A missing native binary fails at import time (the process cannot start), which is equally loud.

Render: build `npm ci && npm run build` (or the Dockerfile), start `node dist/index.js`, health check path `/api/health` (it stays 503 until DB, migrations and the astronomy self-check are all good). Environment for this release: `DATABASE_URL`, `SESSION_SECRET`; optional `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`; leave `FEATURE_AI_COUNCIL`, `FEATURE_CHARA_DASHA`, `V3_PERSIST_LEGACY_UPGRADES` unset. `npm audit --omit=dev`: 39 advisories, all in dependencies that predate V3 (express, axios, firebase, drizzle, …); none in `sweph` or `geo-tz`.

## Feature gates (`server/features.ts`, all default OFF)

| Flag | When off (launch default) | Enable after |
|---|---|---|
| `FEATURE_AI_COUNCIL` | Deep questions use the single guarded explainer | live review of council answers through guard v2 |
| `FEATURE_CHARA_DASHA` | Chara Dasha withheld from professional AI; UI labels it unverified | verification against a reference implementation |
| `V3_PERSIST_LEGACY_UPGRADES` | Legacy charts recalculated on read; rows untouched | backup + staging rehearsal (see Migration) |

Always-on safeguards (not flags): experimental evidence never decides verdicts; partial Shadbala is labelled "Shadbala (partial)" and never totalled; consumer evidence and timeline use Vimshottari only.

## Tests (final run on the PR head)

| Suite | Result |
|---|---|
| Unit (vitest, `tests/unit`) | **577 passed / 0 failed, 32 files (main at `9eb9152`: 208)** |
| — golden astronomy (44 charts) | 187 passed — max engine/reference gap **12.59″** (ru-mow-2012 Ascendant); per body max: Sun 1.1″, Moon 2.2″, Mars 9.5″, Mercury 8.3″, Jupiter 7.4″, Venus 6.4″, Saturn 11.0″, nodes 0.2″, MC 11.6″ (tolerance 30″) |
| — golden Jyotish rules | 33 passed |
| — AI adversarial (`v3-ai-guard`) | 14 passed (invented/absent yogas, invented/denied doshas, wrong Maha/Antardasha, nakshatra/birth star, retrograde, exaltation/debilitation/own sign, combustion, node dignity, sign/house/Lagna, invented years, transit-vs-natal, approximate-time packet and claims, regenerate→fallback flow, fallback self-consistency on 44 charts, disclosure) |
| — security (`v3-launch-security` + P0 + V3 route suites) | 170 passed (`v3-launch-security` 19, `v3-routes` 20, `p0-routes` 33, `p0-review-fixes` 95, `auth` 3) |
| — Panchang / self-check / evidence / legacy / pro parity | Panchang 8, self-check 4, evidence + calibration 20, legacy 7, pro parity/Chara 12, approximate reports 2 — all passed |
| Integration (`tests/integration`, run with an equivalent vitest config) | 12 passed / 0 failed |
| Typecheck (`tsc`) | Passed |
| Production build | Passed (existing large-chunk warning) |
| `git diff --check` (vs `main`) | Passed |
| Clean checkout (`git worktree` + `npm ci`, tsc, test, build) — run at `2bb29db`; the full suite, build and boot were re-run on the final head | Passed: `npm ci` OK; `sweph` and `geo-tz/all` load; tsc OK; tests all passed; build OK |
| Production boot (`node dist/index.js`, Postgres 16, `NODE_ENV=production`) | Passed: `astronomy self-check passed (Swiss Ephemeris, Lahiri, geo-tz/all, ICU)`, then `startup ready`; `/api/health` → `{"ok":true,"ready":true}` |
| Rust (`cargo build --release`, `cargo test`) | Builds; **0 tests exist** in the crate (Rust calculation is retired; `/synastry` and `/remediation` are unchanged). |
| API smoke (`scripts/smoke/v3-smoke.sh … local`) | **39/39** passed, 0 skipped (no OpenAI key: deterministic answers): auth, guest India, saved New York (EDT), V3 reload, D1/D9/D10/Vimshottari, insights, transits, DST gap, approximate chart + transits, legacy view with DB row unchanged, limited legacy (409, and no report sold), Ask Your Kundli simple/deep/approximate/no-chart, matchmaking, Prashna ±location, Panchang default/London/polar, report 402 with no order row, cross-user 404s, unauthenticated 401 |
| UI smoke (Playwright, mobile 390×844 + desktop 1366×820) | **46/46** passed: home, charts list, Kundli (non-India, approximate + timing note), creation step 2 (approximate option), Panchang, Ask Your Kundli, matchmaking, Prashna; no horizontal overflow; 0 page errors; 0 first-party console errors or request failures (third-party fonts/scripts blocked by the sandbox network are excluded and counted separately) |

## Files changed in the launch sprint

`server/astroEngine/{panchang,selfCheck,prashna,index}.ts`, `canonical/{compute,upgrade}.ts`, `evidence/{engine,resolution,insights}.ts`; `server/agents/{answerGuard (new),askKundli,orchestrator,prompts}.ts`; `server/{features (new),routes,storage,index,aiAstrologerService,jyotishAiService}.ts`; `shared/v3/evidence.ts`; client `Panchang.tsx`, `KundliView.tsx`, `AIAstrologer.tsx`, `admin/JyotishReading.tsx`, `components/v3/{LifeTimeline,verdict}.tsx`; `scripts/calibration/distribution.ts`, `scripts/smoke/{v3-smoke,provider-readiness}.sh`; tests `v3-{panchang,launch-security,ai-guard,selfcheck}.test.ts` (new) and updates to `v3-{routes,legacy-upgrade,evidence,ask-kundli,pro-mode}`, `p0-{routes,review-fixes,consumer-ui}`.

**Test expectations changed, and why:** `v3-evidence` "too little evidence" now expects `Insufficient evidence` (new verdict required by the sprint) instead of `Mixed`; `v3-routes` legacy tests now assert *no write by default* and compare-and-swap when enabled (the persistence behaviour changed by design); `p0-consumer-ui` pins the `<LifeTimeline … timingNote>` JSX (new prop); three P0 council-path tests enable `FEATURE_AI_COUNCIL` explicitly because the council is now gated off; `v3-ask-kundli` gains a default-off council test. No golden fixture was regenerated.

## Fresh review of the whole diff

An independent read-only review of `git diff origin/main...HEAD` found 4 blockers and 6 should-fix items; all were verified and are fixed in `a081bf8` unless noted:

1. **Paid report built on a pre-V3 chart** → report orders now return 409 *before any debit* unless the chart is a verified V3 chart (unit + smoke tested).
2. **Paid report showed Lagna/houses/dasha dates for an approximate time** → reports withhold the Lagna, the Ascendant row, house numbers, Lagna-based charts and dasha dates and carry a disclosure in the UI and PDF; the prompt receives none of those facts (unit tested).
3. **Personal horoscope, pre-consult brief, match-astrologer, post-consult follow-up read raw legacy charts** → they use only verified V3 charts (`verifiedChart`); a limited chart gets an explanation, not a reading (unit tested for the horoscope).
4. **Pro/admin `/readings/:id/generate` streamed from a stored pre-V3 snapshot** → recomputed canonically (unit tested).
5. Stale "current" dasha in KundliView/report prompts → derived from dates. Remedies page/tab showed Lagna-based remedies for limited/approximate charts → gated. Unthrottled paid AI paths (AI-astrologer chat path, personal horoscope, brief, match) → per-user limiter; 2000-character message cap. Self-check log wording → states the intended fail-closed behaviour (only `/api/health`, `/api/config` and `/metrics` respond).
6. **Rust build output (2,792 files) had been committed** by this sprint's `git add -A` → removed from the (unpushed) commit; `astro-engine-rs/target/` ignored; a malformed `.gitignore` line that had disabled the `.env.*.local` rule was repaired.
7. **Not fixed (pre-existing, billing scope):** a failed report generation is marked `failed` without a wallet refund, and with no `OPENAI_API_KEY` the life report is a short template. Out of scope for this sprint (it changes billing); listed as a launch condition below.

## Known limitations

1. **Evidence rules are not expert-validated.** Deterministic encodings of textbook principles with engineering thresholds; Career/Leadership remain positive-leaning (flagged above).
2. **Golden-suite independence.** Independent ephemeris; the Lahiri constant is definitional (cross-checked against Spica). No cross-check against Jagannatha Hora or JPL (no network access here).
3. **Partial Shadbala** (3 of 6 components), **Chara Dasha unverified** (gated), **whole-sign houses only**, **simplified doshas** (Mangal cancellation not evaluated).
4. **Guard v2 is pattern-based.** It catches the claim forms listed above in English; paraphrases outside those patterns (or claims in other languages) rely on the prompt rules. Any failure falls back to a correct deterministic answer, so the risk is an un-caught paraphrase, not a wrong fallback.
5. **Approximate birth time** is treated as unknown within the whole birth date — conservative: most approximate charts show Insufficient evidence and no current period.
6. **Panchang** uses a disclosed New Delhi default when no location is given; limbs are at sunrise (no end-times of tithi/nakshatra).
7. **Rust crate** has no tests.

## PRs / commits

Branch `navagraha-v3/full-build`, PR #62 (draft). Build phase: `725ef58` … `3bc6594`. Launch sprint:

| Commit | Summary |
|---|---|
| `605d097` | Location-aware Panchang, astronomy self-check, non-destructive legacy charts, transits, pro tenant fixes, AI rate limit |
| `43a8f8b` | Evidence core/experimental tiers, Insufficient evidence, approximate-time dasha stability, AI guard v2 |
| `0e4b923` | UI regression assertion for the timing note |
| `1223b31` | Feature gates, council audit, Chara Dasha withheld, pro parity tests |
| `2bb29db` | Approximate-time disclosure under every AI answer |
| `fc5b4af` | `git diff --check` fix |
| `7dc7ffc` | Smoke suite, provider readiness script, self-check failure tests (replaces the unpushed `689eb36`, which had committed Rust build output) |
| `a081bf8` | Fresh-review blocker fixes |
| (docs commit) | This report and CLAUDE.md |

## External verification

| Provider | Status | How to verify after deploy |
|---|---|---|
| OpenAI | **NOT VERIFIED** (no key; `api.openai.com` blocked here) | `SMOKE_ALLOW_PAID=1 scripts/smoke/provider-readiness.sh https://<backend>` → expects `answerSource "llm"` |
| Google Maps (browser Places + server Geocoding) | **NOT VERIFIED** (no key; Google blocked here) | same command (server geocoding); open `/kundli/new` and pick a city (Places) |
| Render (build of `sweph`/`geo-tz`, boot) | **NOT VERIFIED** (no Render access) | Render deploy log shows `astronomy self-check passed`; `curl https://<backend>/api/health` → `{"ok":true,"ready":true}` |
| Production database | **NOT VERIFIED** (no production access); local Postgres 16 PASS | health above; then `scripts/smoke/v3-smoke.sh https://<backend>` (live mode: no DB writes beyond two throwaway accounts and their charts; no billing; no paid AI) |
| P0 deployment (PR #61) | **OPEN / NOT VERIFIED** | as in the P0 report |

## Production readiness: **CONDITIONAL GO**

Every code-level blocker found by the sprint and the fresh review is fixed and verified locally (577 unit, 12 integration, 39 API smoke, 46 UI smoke, clean checkout, production boot). Unverified items are deployment checks, and each fails closed: the astronomy self-check keeps the backend unready, AI falls back to deterministic answers, and missing coordinates are refused.

**Conditions (all must pass on the deployed backend before customers are routed to V3; otherwise roll back the deploy):**

1. Confirm the backend commit Render is serving (this also closes the still-OPEN P0 deployment verification), and the deploy log shows `astronomy self-check passed`.
2. `curl https://<backend>/api/health` → `{"ok":true,"ready":true}`.
3. `scripts/smoke/provider-readiness.sh https://<backend>` → 0 FAIL; then `SMOKE_ALLOW_PAID=1 …` → geocoding `geocoded`, OpenAI `answerSource "llm"`. If OpenAI fails, deactivate paid report types until it passes (no refund path exists on failure).
4. `scripts/smoke/v3-smoke.sh https://<backend>` (live mode) → 0 FAIL.
5. Keep `FEATURE_AI_COUNCIL`, `FEATURE_CHARA_DASHA` and `V3_PERSIST_LEGACY_UPGRADES` unset.

Recommended but not gating: expert Jyotish review of the evidence rules and the flagged Career/Leadership positive skew; a wallet refund on failed report generation.
