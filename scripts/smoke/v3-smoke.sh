#!/bin/bash
# V3 launch smoke test against a running server.
#
#   scripts/smoke/v3-smoke.sh <base-url> [local]
#
# Creates two throwaway email/password accounts (…@smoke.test) and their charts.
# Never pays: it aborts unless both wallets are empty, and the report check expects 402.
# Never calls paid AI unless SMOKE_ALLOW_AI=1 (Ask Your Kundli checks are skipped otherwise,
# except in `local` mode, where the server must have no OPENAI_API_KEY and answers deterministically).
# `local` also asserts database state through PSQL (default: the throwaway DB on :55432).
set -u
B=${1:?base url}; MODE=${2:-live}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
SUFFIX=$(date +%s)
O=$T/owner.jar; X=$T/other.jar
PSQL=${PSQL:-"psql -h 127.0.0.1 -p 55432 -U postgres -d navsmoke -tAc"}
pass=0; fail=0; skip=0
chk() { if [ "$2" == "$3" ]; then echo "PASS $1 ($2)"; pass=$((pass+1)); else echo "FAIL $1: got '$2' want '$3'"; fail=$((fail+1)); fi; }
skp() { echo "SKIP $1"; skip=$((skip+1)); }
req() { curl -s -m 90 -o "$T/body.json" -w '%{http_code}' -H 'Content-Type: application/json' -H 'X-Forwarded-Proto: https' "$@"; }
j() { jq -c "$1" "$T/body.json"; }
PW='SmokeTest#2026'
AI=0; { [ "$MODE" == local ] || [ "${SMOKE_ALLOW_AI:-0}" == 1 ]; } && AI=1

echo "== Health =="
chk "health ready" "$(req "$B/api/health"; j .ready)" "200true"

echo "== Auth (email/password) =="
chk "register owner" "$(req -c "$O" -X POST "$B/api/auth/register" -d "{\"email\":\"v3-owner-$SUFFIX@smoke.test\",\"password\":\"$PW\",\"firstName\":\"Owner\"}")" 201
chk "register other" "$(req -c "$X" -X POST "$B/api/auth/register" -d "{\"email\":\"v3-other-$SUFFIX@smoke.test\",\"password\":\"$PW\",\"firstName\":\"Other\"}")" 201
chk "logout" "$(req -b "$O" -c "$O" -X POST "$B/api/auth/logout")" 200
chk "login" "$(req -c "$O" -X POST "$B/api/auth/login" -d "{\"email\":\"v3-owner-$SUFFIX@smoke.test\",\"password\":\"$PW\"}")" 200
chk "wrong password rejected" "$(req -X POST "$B/api/auth/login" -d "{\"email\":\"v3-owner-$SUFFIX@smoke.test\",\"password\":\"nope\"}")" 401
for J in "$O" "$X"; do req -b "$J" "$B/api/wallet" >/dev/null; bal=$(jq -r '.balance // "0"' "$T/body.json"); [ "$(echo "$bal == 0" | bc)" == 1 ] || { echo "ABORT: wallet balance $bal is not zero"; exit 1; }; done
echo "PASS test wallets are empty"

echo "== Kundli =="
chk "guest India (not saved)" "$(req -X POST "$B/api/kundli" -d '{"name":"G","gender":"male","dateOfBirth":"1990-08-15","timeOfBirth":"06:30","placeOfBirth":"Bengaluru","latitude":12.9716,"longitude":77.5946}'; j '[.id,.chartData.canonical.birth.timezone,.chartData.canonical.birth.utcOffset]')" '200[null,"Asia/Kolkata","+05:30"]'
chk "saved non-India (New York, EDT)" "$(req -b "$O" -X POST "$B/api/kundli" -d '{"name":"NY","gender":"female","dateOfBirth":"1990-07-04","timeOfBirth":"12:00","placeOfBirth":"New York","latitude":40.7128,"longitude":-74.006}'; j '[.chartData.canonical.birth.timezone,.chartData.canonical.birth.birthUTC]')" '200["America/New_York","1990-07-04T16:00:00.000Z"]'
NY=$(jq -r .id "$T/body.json")
chk "saved chart reloads as V3" "$(req -b "$O" "$B/api/kundli/$NY"; j .chartStatus.version)" '200"v3"'
chk "D1/D9/D10 placements and Vimshottari present" "$(j '[(.chartData.canonical.planets|length),(.chartData.canonical.vargas.D9.placements|length),(.chartData.canonical.vargas.D10.placements|length),((.chartData.canonical.dashas.vimshottari.mahadashas|length)>=9)]')" '[9,9,9,true]'
chk "insights: 9 domains with valid verdicts" "$(req -b "$O" "$B/api/kundli/$NY/insights"; j '[(.domains|length), ([.domains[].verdict]|all(IN("Exceptional","Very Strong","Strong","Mixed","Challenging","Very Challenging","Insufficient evidence"))), (.timeline|length>0), .timing.mahadashaReliable]')" '200[9,true,true,true]'
chk "transits use the canonical Lagna" "$(req -b "$O" "$B/api/kundli/$NY/transits"; j '.natalLagnaSign != null')" '200true'
chk "DST gap rejected" "$(req -b "$O" -X POST "$B/api/kundli" -d '{"name":"Gap","gender":"male","dateOfBirth":"2021-03-14","timeOfBirth":"02:30","placeOfBirth":"New York","latitude":40.7128,"longitude":-74.006}')" 400
chk "approximate time saved" "$(req -b "$O" -X POST "$B/api/kundli" -d '{"name":"Approx","gender":"male","dateOfBirth":"1988-02-14","timeOfBirth":"06:00","placeOfBirth":"Bengaluru","latitude":12.9716,"longitude":77.5946,"isBirthTimeApproximate":true}'; j .chartData.canonical.birth.timeAccuracy)" '200"approximate"'
AP=$(jq -r .id "$T/body.json")
chk "approximate: no Lagna, timing flagged, evidence excluded" "$(req -b "$O" "$B/api/kundli/$AP/insights"; j '[.headline.lagna, .timing.mahadashaReliable, ([.domains[].excluded|length]|add>0)]')" '200[null,false,true]'
chk "approximate: transits from the Moon only" "$(req -b "$O" "$B/api/kundli/$AP/transits"; j '[.natalLagnaSign, ([.planets[].houseFromLagna]|unique)]')" '200[null,[null]]'

if [ "$MODE" == local ]; then
  OWNER_ID=$($PSQL "select id from users where email='v3-owner-$SUFFIX@smoke.test'")
  LEGACY='{"houses":[],"planetaryPositions":[{"planet":"Sun","sign":"Leo","degree":1,"house":1,"isRetrograde":false}]}'
  LG=$($PSQL "insert into kundlis (user_id,name,date_of_birth,time_of_birth,place_of_birth,latitude,longitude,zodiac_sign,moon_sign,ascendant,chart_data) values ('$OWNER_ID','Legacy','1990-07-04','12:00','New York',40.7128,-74.006,'Leo','Aries','Virgo','$LEGACY') returning id" | head -1)
  chk "legacy chart served as recalculated V3 view" "$(req -b "$O" "$B/api/kundli/$LG"; j '[.chartStatus.version,.chartData.canonical.birth.timezone,(.chartData.legacySnapshot.planetaryPositions|length)]')" '200["v3-recalculated-from-legacy","America/New_York",1]'
  chk "legacy row untouched in the database" "$($PSQL "select (chart_data ? 'canonical')::text || ':' || zodiac_sign from kundlis where id='$LG'")" 'false:Leo'
  NC=$($PSQL "insert into kundlis (user_id,name,date_of_birth,time_of_birth,place_of_birth,chart_data) values ('$OWNER_ID','NoCoords','1990-07-04','12:00','Somewhere','$LEGACY') returning id" | head -1)
  chk "legacy chart without coordinates is limited, not guessed" "$(req -b "$O" "$B/api/kundli/$NC/insights"; j .chartStatus.version)" '409"limited"'
else
  skp "legacy chart checks (need direct DB access; run in local mode)"
fi

echo "== Ask Your Kundli =="
if [ "$AI" == 1 ]; then
  chk "simple question answered from the chart" "$(req -b "$O" -X POST "$B/api/ai/chat" -d "{\"message\":\"How is my career?\",\"kundliId\":\"$NY\"}"; j '[(.reply|length>40), (.evidence.domains|length>0)]')" '200[true,true]'
  [ "$MODE" == local ] && chk "no AI key: deterministic answer" "$(j .answerSource)" '"deterministic"'
  chk "deep question (council gated off) still answered" "$(req -b "$O" -X POST "$B/api/ai/chat" -d "{\"message\":\"Give me a detailed career analysis\",\"kundliId\":\"$NY\",\"depth\":\"deep\"}"; j '(.reply|length>40)')" '200true'
  chk "approximate chart: answer discloses it" "$(req -b "$O" -X POST "$B/api/ai/chat" -d "{\"message\":\"When will my career improve?\",\"kundliId\":\"$AP\"}"; j '(.evidence.disclosure|test("approximate"))')" '200true'
  chk "user without a chart gets no personal claims" "$(req -b "$X" -X POST "$B/api/ai/chat" -d '{"message":"How is my career?"}'; j '(.reply|test("birth details"))')" '200true'
else
  skp "Ask Your Kundli (paid AI; set SMOKE_ALLOW_AI=1 to include)"
fi

echo "== Other tools =="
chk "matchmaking" "$(req -X POST "$B/api/matchmaking" -d '{"person1Name":"A","person1Date":"1990-08-15","person1Time":"06:30","person1Lat":12.9716,"person1Lon":77.5946,"person2Name":"B","person2Date":"1992-05-13","person2Time":"10:00","person2Lat":19.076,"person2Lon":72.8777}'; j '(.gunaScore|type)')" '200"number"'
chk "prashna with location" "$(req -X POST "$B/api/prashna" -d '{"latitude":12.9716,"longitude":77.5946,"question_category":"career"}'; j '(.panchang.hora_lord|type)')" '200"string"'
chk "prashna without location refused" "$(req -X POST "$B/api/prashna" -d '{"question_category":"career"}')" 400
chk "panchang default is disclosed" "$(req "$B/api/panchang?date=2024-06-21"; j '[.location.isDefault,.location.timezone]')" '200[true,"Asia/Kolkata"]'
chk "panchang London uses BST" "$(req "$B/api/panchang?date=2024-06-21&lat=51.5074&lng=-0.1278"; j '[.location.timezone,.location.utcOffset]')" '200["Europe/London","+01:00"]'
chk "panchang polar day refused" "$(req "$B/api/panchang?date=2024-06-21&lat=69.6492&lng=18.9553")" 400

echo "== Reports (no billing) =="
req "$B/api/reports/types" >/dev/null; RT=$(jq -r '[.[] | select(.isActive != false and .category != "life_complete")][0].id // empty' "$T/body.json")
if [ -n "$RT" ]; then
  chk "report order with empty wallet is refused" "$(req -b "$O" -X POST "$B/api/reports/order" -d "{\"kundliId\":\"$NY\",\"reportTypeId\":\"$RT\"}")" 402
  [ "$MODE" == local ] && chk "no report order or debit recorded" "$($PSQL "select count(*) from report_orders where user_id='$OWNER_ID'")" 0
else skp "report order (no active report type)"; fi

echo "== Cross-user denial =="
for p in "" /insights /transits; do chk "other user GET /api/kundli/:id$p" "$(req -b "$X" "$B/api/kundli/$NY$p")" 404; done
chk "other user chat on owner's chart" "$(req -b "$X" -X POST "$B/api/ai/chat" -d "{\"message\":\"x\",\"kundliId\":\"$NY\"}")" 404
chk "other user report on owner's chart" "$(req -b "$X" -X POST "$B/api/reports/order" -d "{\"kundliId\":\"$NY\",\"reportTypeId\":\"${RT:-x}\"}")" 404
chk "unauthenticated chart read" "$(req "$B/api/kundli/$NY")" 401

echo "TOTAL pass=$pass fail=$fail skip=$skip"
[ "$fail" == 0 ]
