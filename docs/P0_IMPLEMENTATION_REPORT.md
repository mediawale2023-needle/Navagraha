# P0 Implementation Report

Branch: `navagraha-v3/p0-foundation`

Scope: Foundation / Accuracy / Security only. Delivery is an isolated P0 commit and a draft PR against `main`. No merge, deployment or P1 work is authorized.

## Confirmed issues

- `/api/ai/chat` wrapped the complete consumer `chartData` object as `planets`. The council forwarded it to Rust as though it were a `PlanetInput[]`.
- The council defaulted missing Ascendant longitude and latitude to zero, and Julian day to J2000. Consumer generation calculated exact inputs, but saved only rounded display positions; its `raw.jd` was not persisted by the routes.
- Saved Kundli and transit GET endpoints permitted unauthenticated reads without ownership checks. Paid report orders accepted any saved Kundli ID. AI interpretation already checked ownership; AI chat already discarded foreign charts but could silently select a different chart afterward.
- Matchmaking and synastry fabricated Delhi/Mumbai coordinates. Prashna fabricated Delhi coordinates on the client and rejected legitimate zero coordinates on the server.
- Coordinate resolution accepted out-of-range numbers and numeric prefixes such as `12junk`, and did not validate geocoder coordinate ranges.
- KundliView presented three static personalized placement interpretations for every chart.
- KundliNew called a fixed 06:00 placeholder sunrise and did not retain uncertainty.
- Review found that Rust's declared tropical wire contract is internally inconsistent: D9 divides tropical longitude directly but compares against sidereal D1, while Pushkar subtracts a fixed 24°. Sending sidereal longitude instead would break Pushkar; a payload transformation cannot reconcile both.
- Review found that supplied seconds were silently dropped by `setUTCMinutes`, malformed/out-of-range times could normalize to another instant, and matching/synastry assumed noon for missing times. These now fail validation or preserve the actual supplied seconds.
- AI chat wrote history before rejecting foreign chart IDs or failed location resolution. Rejected requests now have no chat-write side effect.

## Files changed

| File | Reason |
| --- | --- |
| `server/rustChartAdapter.ts` | Typed, validated consumer-to-Rust adapter; explicit unavailable reasons for incomplete or malformed inputs. |
| `server/astroEngine/index.ts` | Preserve exact Julian day, location, tropical Ascendant, ayanamsa and tropical planetary longitudes in existing chart JSON; reject invalid coordinates/date-time results. Existing calculation rules remain unchanged. |
| `server/astroEngineClient.ts` | Fail closed for the inconsistent Rust `/calculate` frame contract; no HTTP request or environment bypass. |
| `server/agents/orchestrator.ts` | Consume the adapter result; remove astronomical defaults, log skipped calculations, and instruct agents not to invent missing facts/strengths. |
| `server/routes.ts` | Guard all saved Kundli-by-ID reads, reject foreign explicit IDs consistently with 404, validate/resolve matchmaking, synastry and Prashna locations, fix council chart context, and persist resolved coordinates and approximate-time metadata. |
| `server/geocode.ts` | Strict numeric/range validation for supplied and resolved coordinates; preserve genuine zero values. |
| `client/src/pages/KundliNew.tsx` | Explicit unknown-time option with placeholder disclosure, persistent uncertainty flag, and clearing stale coordinates after place edits. |
| `client/src/pages/KundliView.tsx` | Remove static claims, retain the Insights tab with an unavailable message, and disclose approximate birth time on saved/guest charts. |
| `client/src/pages/Prashna.tsx` | Send actual coordinates and entered location without a city fallback; clear stale coordinates after place edits. |
| `tests/unit/rust-chart-adapter.test.ts` | Exact Rust payload and invocation/skip regression tests. |
| `tests/unit/rust-client-safety.test.ts` | Exercise the real Rust client and prove valid chart inputs do not cause HTTP calculation while the frame contract is inconsistent. |
| `tests/unit/birth-input.test.ts` | Reject malformed birth times and preserve supplied seconds in Julian day. |
| `tests/unit/geocode.test.ts` | Explicit/resolved coordinates, strict validation and failure regression tests. |
| `tests/unit/p0-routes.test.ts` | Test actual registered routes using the real authentication guard with mocked storage/external services. |
| `tests/unit/p0-consumer-ui.test.ts` | Source guards for removed claims, approximate-time disclosures, and Prashna payload. |
| `docs/P0_IMPLEMENTATION_REPORT.md` | Review findings, validation and deferred work. |

The pre-existing untracked `User-kundali-report.pdf` was not modified.

## Behaviour before

Rust could receive a malformed planetary payload and fabricated epoch/location inputs. Saved chart data could be disclosed to nonowners or used to order a report. Unavailable coordinates could cause calculation for another city. Static claims and a fixed time appeared personalized or precise.

## Behaviour after

- The adapter constructs nine real planets (excluding the Ascendant pseudo-planet), exact tropical longitudes, sidereal sign numbers, Bhava Chalit house numbers, retrograde flags, global nakshatra pada indices (1–108), and the actual calculated tropical Ascendant, latitude and birth Julian day. This matches the declared wire shape, but **the council and client deliberately skip Rust `/calculate` for every chart in P0**, with an explicit internal reason, because its Varga coordinate frames cannot be reconciled by a payload alone. No Rust methodology was changed. Validating the payload does not enable execution.
- Required fields, ranges, planet completeness/uniqueness and sign, degree, whole-sign house and Chalit consistency are validated. Incomplete legacy charts skip Rust with an internal reason; the LLM council can continue with supplied facts. Actual zero coordinates and an actual J2000 birth instant remain valid.
- Saved-chart GET, transit, interpretation, AI chat and report-order paths require authentication and ownership. Unauthenticated requests receive 401; missing/foreign explicit charts receive 404. Foreign explicit IDs cannot fall through to birth details or the user's latest chart. Both Passport and email/password sessions work.
- Guest chart generation remains public and returns a preview without saving. The existing session-storage preview flow remains intact.
- Natal/matching/Prashna routes use validated explicit coordinates or successfully resolved supplied places. Failed resolution returns 400, before saving a chart, writing chat history or billing. Missing matching/synastry times and malformed times return 400; supplied seconds are preserved. Resolved coordinates are also stored in saved Kundlis.
- The Insights tab retains its structure without static personal claims. Unknown time retains 06:00 only as a clearly disclosed placeholder, with `chartData.isBirthTimeApproximate` persisted in existing JSON. Editing the time clears the flag. No database migration is needed.

## Tests added

74 focused tests cover:

- Correct Rust planetary array, exact Ascendant, latitude and Julian day; field names, houses, signs, pada and retrograde mapping.
- Missing inputs, legacy charts, duplicate/missing planets and malformed values prevent Rust invocation while allowing council continuation.
- Owner access, cross-user denial and unauthenticated denial for all five saved-chart endpoint paths; email/password session ownership; no AI/billing on denied requests.
- Guest preview calculation without persistence; saved resolved coordinates and approximate-time metadata, including an owner save/reload round trip through the production endpoints and a JSON persistence mock.
- Supplied coordinates (including zero), geocoded places, invalid inputs, failed geocoding and removal of default-city calculations.
- Real Rust-client no-HTTP guard, missing-time rejection and birth-second precision.
- Consumer UI source regressions for static claims and approximate-time wording. These are source guards, not browser interaction tests.

## Test results

- `npm test`: **113 tests passed across 17 files** (74 new P0 tests).
- `npm run check`: **passed**. Baseline type checking passed before changes as well.
- `npm run build`: **passed**, with Vite's large-chunk warning.
- `git diff --check`: **passed**; final changes reviewed for P0 scope.
- No lint script is configured.

Route tests use temporary local sockets. The sandbox initially blocked socket binding; rerunning with approved execution permissions passed. External geocoding, LLM, Rust HTTP and database services are mocked. The configured Vitest suite includes `tests/unit`; historical `tests/integration` smoke tests are excluded by the existing configuration and were not counted as executed.

## Remaining risks

- All charts skip Rust `/calculate` until its coordinate-frame contract is corrected in a reviewed follow-up. Regenerating a chart does not bypass this guard. Older saved charts also lack exact persisted inputs. P0 deliberately avoids backfilling or reconstructing precise astronomy from rounded degrees.
- The consumer engine continues to assume IST and retains its existing astronomical approximations. Rust retains existing simplified strength calculations and mixed Varga conventions, but the council cannot run that calculation in P0. The adapter alone does not certify those algorithms as authoritative Jyotish calculations.
- Live Rust/database/geocoding integration and browser interaction were not exercised. Birthplace resolution requires a configured Google Maps API key when coordinates are absent.
- Unknown birth time still uses an explicitly approximate placeholder; rectification is not implemented. Existing saved charts cannot retrospectively reveal whether a user previously chose the old sunrise shortcut.
- Repository-wide location review found the life-report transit helper uses fixed Delhi/noon inputs solely to extract geocentric planet signs. Those signs do not depend on birth coordinates; it is not a fallback for a person's natal chart and was left unchanged in P0.
- The existing large frontend bundle remains a build warning; dependency upgrades and bundle refactoring are outside this change.

## Deferred intentionally to P1

CanonicalChart, a single Swiss Ephemeris calculation source, consumer-engine migration, Evidence/Resolution Engines, Rust methodology corrections, birth-time rectification, scores, Life Timeline, redesigns, interpretation/rule changes and unrelated refactoring.

P0 stops here for review. P1 has not been started.
