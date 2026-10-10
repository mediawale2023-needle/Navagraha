# Browser acceptance — launch UX fixes

`launch-ux.mjs` drives a running Navagraha build in Chromium at 390×844 and 1366×900
and asserts each launch UX fix (audit IDs F01–F40). Every check asserts behaviour;
screenshots of each affected screen and `results.json` are written to `OUT_DIR`.
The process exits 1 if any check fails.

Dependencies are pinned: `playwright-core@1.56.1` (exact, with `package-lock.json`),
which drives Chromium revision 1194. They are kept out of the app's `package.json`.

```bash
cd scripts/acceptance
npm ci
npx playwright-core install chromium          # or set CHROMIUM_PATH to an existing build of revision 1194
BASE_URL=http://127.0.0.1:5000 OUT_DIR=./out node launch-ux.mjs
```

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | the running build (default `http://127.0.0.1:5000`) |
| `OUT_DIR` | screenshots and `results.json` (default `./out`) |
| `CHROMIUM_PATH` | an existing Chromium executable instead of the downloaded one |
| `FORWARDED_PROTO=https` | send `X-Forwarded-Proto`, for a production build (secure cookies) served over plain HTTP locally |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | an admin (free access) account: checks admins can still order reports with no balance |
| `PRO_EMAIL`, `PRO_PASSWORD` | a Pro astrologer account: checks the Pro workspace labels its birth-star gemstone list (F16b) |
| `DATABASE_URL` | with `psql` on `PATH`: inserts a pre-V3 chart without coordinates for the legacy-chart checks (F11, F13) |
| `FONTS_VIA_CURL=1` | fetch Google font files with `curl` (for sandboxes whose proxy strips CORS headers) |

Checks that need something the environment lacks are reported as `SKIP` with the
reason (for example F13 without `DATABASE_URL`, or F08b when a Google key lets the
server geocode the typed place). It creates test users and charts, so point it at a
local or staging database, never production.

## Birth-place field — `birthplace.mjs`

Drives Generate Kundli → Location at both viewports with Google Maps replaced by a
deterministic Places API (New) double (coordinates recorded from the live API), so it
needs no key or network access to Google. Checks continuous typing keeps focus and
every character (BP1), mouse/touch selection sends the exact coordinates and the
server resolves the time zone (BP2), keyboard selection (BP3), editing after a pick
drops the coordinates (BP4), empty results (BP5), a search API error (BP6), a Maps
script that fails to load (BP7) and that the icons do not overlap the text (BP8).

```bash
BASE_URL=http://127.0.0.1:5000 OUT_DIR=./out node birthplace.mjs
```

It accepts `CHROMIUM_PATH` and `FORWARDED_PROTO` as above and creates guest charts only.

## Report order dialog — `report-order.mjs`

Drives the report order dialog at both viewports against a local build started with a dummy
`OPENAI_API_KEY` (orders are accepted, generation fails, the order is refunded) and a
disposable database (`DATABASE_URL`, used to set a wallet balance and insert a chart without
coordinates). Places are a test double, as above. Checks: an account without charts can
still choose Saved chart and is offered a way forward; typing "khamgaon" suggests Khamgaon,
Maharashtra; typed text alone cannot be ordered and editing after a pick clears the
coordinates; the order sends the picked coordinates and is charged the shown price, then
refunded; saved charts show name, date, time and place, with a limited chart disabled; a saved
chart orders by id only; another account's chart id is refused before any charge; without a
Maps key the field says suggestions are unavailable.
