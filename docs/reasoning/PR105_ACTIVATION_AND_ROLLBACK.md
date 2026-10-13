# USER_FACING_REASONING_V1 — activation and rollback

The flag is read on the server for every request (`server/features.ts`, `features.userFacingReasoning()`),
only when the environment variable is exactly `true`. Nothing in the client turns it on: the client renders
explanations only when the server sends them.

## What the flag changes

| Surface | Off (default) | On |
|---|---|---|
| Insights (`GET /api/kundli/:id/insights`, `POST /api/kundli/insights`) | Unchanged payload | Adds an `explanations` field |
| Kundli (evidence sheet, overview) | Unchanged | Shows "In plain words" and "Your periods and yogas, explained" when `explanations` is present |
| Ask your Kundli | Packet text byte-identical | A grounding block is appended to the packet; the answer guard runs unchanged |
| Paid reports | Prompts byte-identical | A grounding block is appended to the prompt only; the guard's facts (`chartSummary`) are unchanged |

Never changed by the flag: chart calculations, verdicts, confidence, evidence and weights, dasha and yoga
detection, remedies, ownership checks, prices, wallet debits, report eligibility and refunds.

If building the context fails for any reason, `server/userFacingReasoning.ts` returns nothing and every
surface falls back to the old behaviour (a one-line error with no chart details is logged).

## Recommended activation

1. Staging first: set `USER_FACING_REASONING_V1=true` on staging only; leave production unset.
2. Have an astrologer review `docs/reasoning/PR105_BEFORE_AFTER.md` and a sample of live charts, including
   approximate-time charts. The wording restates existing evidence but has not been astrologically validated.
3. Check Ask answers on staging against the guard (no new guard rejections pattern), and generate one report
   of each offered type with an admin account (free access, no wallet movement).
4. Watch AI spend: Ask adds roughly 370–690 input tokens per question and reports roughly 1,100–3,000 per call
   (`docs/reasoning/PR105_BEFORE_AFTER.md`); the daily dollar budget still governs Ask.
5. Then enable in production by setting the variable and restarting.

## Rollback

Unset `USER_FACING_REASONING_V1` (or set it to anything other than `true`) and restart. No migration, data
repair, payment change or chart recalculation is involved: nothing is stored. Reports already generated keep
their text; new ones use the old prompt.
