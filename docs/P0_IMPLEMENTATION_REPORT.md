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

## Review follow-up (PR #61)

Review of the first P0 commit found two blockers. Both were reproduced against the real Express handlers. A regression suite now covers them and fails against the earlier handlers.

### Finding A: `POST /api/feedback` trusted the request body

- **Before:** the payload was `{ userId: req.user.id, ...req.body }`. A body `userId` overrode the authenticated identity, and any user's `kundliId` was accepted without an ownership check.
- **After:** the body is parsed by an explicit Zod schema covering `kundliId?`, `predictionCategory`, `wasAccurate`, `dashaSystemUsed`, `predictedDate?` and `actualOccurrenceDate?`. Unknown fields (`userId`, `id`, `processedAt`, …) are stripped. `userId` comes only from the session. A supplied `kundliId` must be a non-empty string, otherwise the route returns 400. It must also belong to the caller: a missing or foreign chart gets the standard `404 Kundli not found` before any write. Feedback without a chart reference is still accepted.

### Finding B: incomplete explicit `birthDetails` bypassed validation

- **Before:** `/api/reports/order` and `/api/ai/chat` only entered the calculation path when both `dateOfBirth` and `timeOfBirth` were truthy. With `{ dateOfBirth, timeOfBirth: "" }`, the report route silently billed for the user's latest saved chart, and chat ran without the requested chart.
- **After:** a shared `selectChart()` helper in `server/birthDetails.ts` runs before any storage read, billing, chat write, council call or memory extraction:
  - Neither `kundliId` nor `birthDetails` supplied: the documented latest-saved-chart fallback still applies.
  - `birthDetails` supplied (including `null` or `{}`): it must pass `explicitBirthDetailsSchema`. That requires a real `YYYY-MM-DD` calendar date and an `HH:MM` or `HH:MM:SS` time in range, with typed optional fields. Anything else returns 400 and never falls back.
  - `kundliId` supplied: it must be a non-empty string (otherwise 400). The ownership check still returns 404 and never falls back.
  - Both supplied: rejected with 400 as ambiguous. The client never sends both.
- Location handling is unchanged: valid coordinates are used, otherwise the supplied place is resolved, otherwise the route returns 400. The IST assumption, the approximate-time flag and seconds precision are unchanged. No noon/06:00/J2000/zero-coordinate/default-city fallback was added.

### Regression coverage added (`tests/unit/p0-review-fixes.test.ts`)

These tests use the real registered routes and the real `isAuthenticated` guard. Storage, geocoding and the LLM are mocked, and the user always has a saved chart so any silent fallback would be visible.

- **Feedback:** the owner can submit; a foreign or missing chart gets 404; unauthenticated requests get 401; a body `userId` cannot change the stored identity (with and without a chart); feedback without a chart works; email/password sessions work; malformed `kundliId`, field and date input gets 400. Every denied request is checked to make no `createPredictionFeedback` call.
- **Report order and AI chat (each):** 16 invalid `birthDetails` shapes return 400. They include the reviewed empty-time case, missing/empty date or time, `{}`, `null`, wrong types, invalid calendar dates and out-of-range or malformed times. Each is checked for no chart reads or fallback, no debit, order, report generation, chat write, memory read, council call, memory extraction or geocoding. Further cases: malformed `kundliId` gets 400; ambiguous `kundliId` plus `birthDetails` gets 400; foreign or missing `kundliId` gets 404; an unresolvable place gets 400; omitted `birthDetails` keeps the fallback; valid `HH:MM` and `HH:MM:SS` details are accepted; place resolution works.
- The report fallback bills and generates from the saved chart only when `birthDetails` is omitted. Explicit details produce an unsaved chart that keeps seconds and the approximate flag. Chat passes the explicit chart, not the saved one, to the council.
- Unit cases for the schema's date and time boundaries (leap day, 23:59:59, 24:00, 12:60, …).
- One existing fixture in `p0-routes.test.ts` sent `kundliId` and `birthDetails` together to chat. It now sends `kundliId` only and still exercises the same ownership checks.

### Rust guard

Unchanged. `/calculate` remains disabled for all charts, and the real-client test still proves no HTTP request is sent.

### Follow-up validation

- `npm test`: **208 tests passed across 18 files** (95 new in this follow-up, most of them parameterised cases).
- `npm run check`: **passed**.
- `npm run build`: **passed** (same large-chunk warning).
- `git diff --check`: **passed**. No lint script is configured.

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
