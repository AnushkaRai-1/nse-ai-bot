#!/usr/bin/env bash
# E2E Smoke Test for SentinelQuant AI Platform
set -euo pipefail

API="http://localhost:8000/api/v1"
PASS=0
FAIL=0
RESULTS=""

check() {
  local label="$1"
  local code="$2"
  if [ "$code" = "0" ]; then
    PASS=$((PASS + 1))
    RESULTS+="  ✅ $label\n"
  else
    FAIL=$((FAIL + 1))
    RESULTS+="  ❌ $label\n"
  fi
}

echo "╔══════════════════════════════════════════════════════╗"
echo "║   SentinelQuant E2E Smoke Test                      ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')                            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "==================== INTEGRATION TESTING ===================="
echo "Take a screenshot after the results summary appears below."
echo ""

# ── 1. AUTH ──────────────────────────────────────────────
echo "▶ AUTH ENDPOINTS"

# Signup
RAND=$RANDOM
SIGNUP=$(curl -sf -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"smoke${RAND}@test.com\",\"password\":\"Smoke1Test\",\"name\":\"Smoke Tester\"}" 2>&1) && check "POST /auth/register (signup)" 0 || check "POST /auth/register (signup)" 1
echo "    → $(echo "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('email','?'), 'role:', d.get('role','?'))" 2>/dev/null || echo "$SIGNUP" | head -c 100)"

# Login
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}' 2>&1)
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then check "POST /auth/login" 0; else check "POST /auth/login" 1; fi
echo "    → token length: ${#TOKEN}"

AUTH="Authorization: Bearer $TOKEN"

# Get me
ME=$(curl -sf "$API/auth/me" -H "$AUTH" 2>&1) && check "GET /auth/me" 0 || check "GET /auth/me" 1
echo "    → $(echo "$ME" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','?'), '-', d.get('email','?'))" 2>/dev/null || echo "parse error")"

# Profile update
PATCH=$(curl -sf -X PATCH "$API/auth/me" -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"Test Admin"}' 2>&1) && check "PATCH /auth/me (update profile)" 0 || check "PATCH /auth/me (update profile)" 1
echo "    → $(echo "$PATCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('name →', d.get('name','?'))" 2>/dev/null || echo "parse error")"

# Change password
PWCH=$(curl -sf -X POST "$API/auth/change-password" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"current_password":"Test123!","new_password":"Test456!"}' 2>&1) && check "POST /auth/change-password" 0 || check "POST /auth/change-password" 1
echo "    → $(echo "$PWCH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','?'))" 2>/dev/null || echo "$PWCH" | head -c 80)"
# Revert password
curl -sf -X POST "$API/auth/change-password" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"current_password":"Test456!","new_password":"Test123!"}' > /dev/null 2>&1
echo "    → (reverted back to original)"

echo ""

# ── 2. MARKET DATA ──────────────────────────────────────
echo "▶ MARKET DATA ENDPOINTS"

STOCKS=$(curl -sf "$API/market/stocks?limit=5" -H "$AUTH" 2>&1) && check "GET /market/stocks" 0 || check "GET /market/stocks" 1
echo "    → $(echo "$STOCKS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0), 'stocks')" 2>/dev/null || echo "parse error")"

SEARCH=$(curl -sf "$API/market/stocks?search=reliance&limit=5" -H "$AUTH" 2>&1) && check "GET /market/stocks?search=reliance" 0 || check "GET /market/stocks?search=reliance" 1
echo "    → $(echo "$SEARCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0), 'results for reliance')" 2>/dev/null || echo "parse error")"

# Pick first symbol from the results
SYM=$(echo "$STOCKS" | python3 -c "import sys,json; print(json.load(sys.stdin)['stocks'][0]['symbol'])" 2>/dev/null || echo "RELIANCE")
echo "    (using symbol: $SYM for remaining tests)"

QUOTE=$(curl -sf "$API/market/quote/$SYM" -H "$AUTH" 2>&1) && check "GET /market/quote/$SYM" 0 || check "GET /market/quote/$SYM" 1
echo "    → $(echo "$QUOTE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('₹'+str(d.get('price','?')), 'change:', str(d.get('changePercent','?'))+'%')" 2>/dev/null || echo "parse error")"

HIST=$(curl -sf "$API/market/historical/$SYM?days=30" -H "$AUTH" 2>&1) && check "GET /market/historical/$SYM" 0 || check "GET /market/historical/$SYM" 1
echo "    → $(echo "$HIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0), 'data points')" 2>/dev/null || echo "parse error")"

BATCH=$(curl -sf -X POST "$API/market/quotes/batch" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"symbols":["RELIANCE","TCS","INFY"]}' 2>&1) && check "POST /market/quotes/batch" 0 || check "POST /market/quotes/batch" 1
echo "    → $(echo "$BATCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0), 'quotes')" 2>/dev/null || echo "parse error")"

SECTORS=$(curl -sf "$API/market/sectors" -H "$AUTH" 2>&1) && check "GET /market/sectors" 0 || check "GET /market/sectors" 1
echo "    → $(echo "$SECTORS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sectors',[])), 'sectors')" 2>/dev/null || echo "parse error")"

OVW=$(curl -sf "$API/market/overview" -H "$AUTH" 2>&1) && check "GET /market/overview" 0 || check "GET /market/overview" 1
echo "    → $(echo "$OVW" | python3 -c "import sys,json; d=json.load(sys.stdin); print('adv:', d.get('advances',0), 'dec:', d.get('declines',0), 'total:', d.get('totalStocks',0))" 2>/dev/null || echo "parse error")"

REGIME=$(curl -sf "$API/market/regime" -H "$AUTH" 2>&1) && check "GET /market/regime" 0 || check "GET /market/regime" 1
echo "    → $(echo "$REGIME" | python3 -c "import sys,json; d=json.load(sys.stdin); print('regime:', d.get('regime','?'), 'conf:', d.get('confidence','?'))" 2>/dev/null || echo "parse error")"

echo ""

# ── 3. AI / RECOMMENDATIONS ─────────────────────────────
echo "▶ AI & RECOMMENDATIONS"

RECS=$(curl -sf "$API/recommendations?limit=5" -H "$AUTH" 2>&1) && check "GET /recommendations" 0 || check "GET /recommendations" 1
echo "    → $(echo "$RECS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_count',0), 'signals, regime:', d.get('regime','?'))" 2>/dev/null || echo "parse error")"

REC1=$(curl -sf "$API/recommendations/$SYM" -H "$AUTH" 2>&1) && check "GET /recommendations/$SYM" 0 || check "GET /recommendations/$SYM" 1
echo "    → $(echo "$REC1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('direction','?'), 'score:', d.get('score','?'), 'conf:', str(d.get('confidence_pct','?'))+'%')" 2>/dev/null || echo "parse error")"

SIGS=$(curl -sf "$API/stocks/$SYM/signals" -H "$AUTH" 2>&1) && check "GET /stocks/$SYM/signals" 0 || check "GET /stocks/$SYM/signals" 1
echo "    → $(echo "$SIGS" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('technical',{}); print('RSI:', t.get('rsi_14','?'), 'ADX:', t.get('adx_value','?'), 'regime:', d.get('regime','?'))" 2>/dev/null || echo "parse error")"

SCREEN=$(curl -sf "$API/market/screener?limit=5&direction=long" -H "$AUTH" 2>&1) && check "GET /market/screener?direction=long" 0 || check "GET /market/screener?direction=long" 1
echo "    → $(echo "$SCREEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0), 'screener results')" 2>/dev/null || echo "parse error")"

echo ""

# ── 4. ADMIN ─────────────────────────────────────────────
echo "▶ ADMIN ENDPOINTS"

HEALTH=$(curl -sf "$API/admin/health" -H "$AUTH" 2>&1) && check "GET /admin/health" 0 || check "GET /admin/health" 1
echo "    → $(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('db:', d.get('database','?'), 'redis:', d.get('redis','?'))" 2>/dev/null || echo "parse error")"

FRESH=$(curl -sf "$API/admin/data-freshness" -H "$AUTH" 2>&1) && check "GET /admin/data-freshness" 0 || check "GET /admin/data-freshness" 1
echo "    → $(echo "$FRESH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('stocks:', d.get('stock_count',0), 'signals:', d.get('latest_signal_count',0), 'stale:', str(d.get('staleness_days','?'))+'d')" 2>/dev/null || echo "parse error")"

JOBS=$(curl -sf "$API/admin/jobs" -H "$AUTH" 2>&1) && check "GET /admin/jobs" 0 || check "GET /admin/jobs" 1
echo "    → $(echo "$JOBS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('jobs',[])), 'jobs configured')" 2>/dev/null || echo "parse error")"

echo ""

# ── SUMMARY ──────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║   RESULTS: $PASS passed, $FAIL failed                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo -e "$RESULTS"

if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  Some tests failed. Check output above."
  exit 1
else
  echo "🎉 All endpoints working!"
  exit 0
fi
