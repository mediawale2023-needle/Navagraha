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
