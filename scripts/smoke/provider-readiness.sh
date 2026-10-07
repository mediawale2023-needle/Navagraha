#!/bin/bash
# Post-deploy provider readiness for a V3 deployment.
#
#   scripts/smoke/provider-readiness.sh <base-url>            # free checks only
#   SMOKE_ALLOW_PAID=1 scripts/smoke/provider-readiness.sh <base-url>
#                                                             # + one geocode and one AI answer
#
# Free checks: /api/health readiness (database + migrations + the boot astronomy
# self-check, i.e. sweph, Lahiri, geo-tz/all, ICU), a Swiss-Ephemeris chart and a
# Panchang computed by the deployed server, and whether a Maps key is configured.
# Paid checks (opt-in) create one throwaway account, geocode one place server-side
# (Google Geocoding) and ask one question (OpenAI; one gpt-4o-mini call).
set -u
B=${1:?base url}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0; nv=0
chk() { if [ "$2" == "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1: got '$2' want '$3'"; fail=$((fail+1)); fi; }
notv() { echo "NOT VERIFIED $1"; nv=$((nv+1)); }
req() { curl -s -m 90 -o "$T/b.json" -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }

echo "== Database, migrations and astronomy self-check =="
chk "/api/health ready (DB reachable, migrations ran, astronomy self-check passed)" "$(req "$B/api/health"; jq -c .ready "$T/b.json")" "200true"
[ "$(jq -r .error "$T/b.json")" != null ] && echo "  health error: $(jq -r .error "$T/b.json")"

echo "== Swiss Ephemeris + geo-tz/all in the deployed build =="
chk "Nairobi 1950 chart resolves Africa/Nairobi (+03:00) with Swiss/Lahiri" "$(req -X POST "$B/api/kundli" -d '{"name":"Readiness","gender":"male","dateOfBirth":"1950-06-01","timeOfBirth":"12:00","placeOfBirth":"Nairobi","latitude":-1.2921,"longitude":36.8219}'; jq -c '[.chartData.canonical.birth.timezone,.chartData.canonical.birth.utcOffset,.chartData.canonical.meta.ayanamsa]' "$T/b.json")" '200["Africa/Nairobi","+03:00","Lahiri"]'
chk "Panchang sunrise from Swiss rise_trans (London, BST)" "$(req "$B/api/panchang?date=2024-06-21&lat=51.5074&lng=-0.1278"; jq -c '[.location.utcOffset,(.sunrise|test("^4:4[0-9] AM$"))]' "$T/b.json")" '200["+01:00",true]'

echo "== Google Maps =="
req "$B/api/config" >/dev/null
if [ -n "$(jq -r '.googleMapsApiKey // empty' "$T/b.json")" ]; then echo "INFO a browser Maps key is configured (Places autocomplete); browser loading is verified only in a real browser session"; else notv "Google Maps: no browser key configured (place search falls back to typed coordinates)"; fi

echo "== Paid providers (opt-in) =="
if [ "${SMOKE_ALLOW_PAID:-0}" == 1 ]; then
  J=$T/jar; EMAIL="readiness-$(date +%s)@smoke.test"
  req -c "$J" -H 'X-Forwarded-Proto: https' -X POST "$B/api/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"Readiness#2026\",\"firstName\":\"Readiness\"}" >/dev/null
  chk "server-side geocoding (Google Geocoding API) for a place without coordinates" "$(req -b "$J" -H 'X-Forwarded-Proto: https' -X POST "$B/api/kundli" -d '{"name":"Geo","gender":"male","dateOfBirth":"1990-08-15","timeOfBirth":"06:30","placeOfBirth":"Pune, Maharashtra, India"}'; jq -c '[.chartData.canonical.birth.coordinateSource,.chartData.canonical.birth.timezone]' "$T/b.json")" '200["geocoded","Asia/Kolkata"]'
  K=$(jq -r .id "$T/b.json")
  chk "OpenAI answer passes the chart guard (answerSource llm)" "$(req -b "$J" -H 'X-Forwarded-Proto: https' -X POST "$B/api/ai/chat" -d "{\"message\":\"How is my career?\",\"kundliId\":\"$K\"}"; jq -c .answerSource "$T/b.json")" '200"llm"'
  echo "  (answerSource \"deterministic\" means OPENAI_API_KEY is missing/invalid or the model answer failed the guard twice)"
else
  notv "Google Geocoding (server key) — run with SMOKE_ALLOW_PAID=1"
  notv "OpenAI — run with SMOKE_ALLOW_PAID=1"
fi

echo "TOTAL pass=$pass fail=$fail not_verified=$nv"
[ "$fail" == 0 ]
