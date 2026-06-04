#!/usr/bin/env bash
# Smoke-test the Veronica API across Phases 0-3.
# Usage: bash scripts/smoke.sh [BASE_URL] [ADMIN_EMAIL] [ADMIN_PASSWORD]
#   bash scripts/smoke.sh                                  # local (http://localhost:8787)
#   bash scripts/smoke.sh https://veronica-api-staging.fly.dev
set -uo pipefail
BASE="${1:-http://localhost:8787}"
ADMIN_EMAIL="${2:-admin@veronica.dev}"
ADMIN_PASS="${3:-VeronicaDev123!}"
PHONE="+9198$(printf '%08d' $((RANDOM % 100000000)))" # random so OTP rate-limit doesn't fail re-runs
pass=0; fail=0

check() { # name expected method path [data] [token]
  local name="$1" exp="$2" method="$3" path="$4" data="${5:-}" token="${6:-}"
  local a=(-s -o /dev/null -w "%{http_code}" -X "$method")
  [ -n "$data" ] && a+=(-H "Content-Type: application/json" -d "$data")
  [ -n "$token" ] && a+=(-H "Authorization: Bearer $token")
  local code; code=$(curl "${a[@]}" "$BASE$path" 2>/dev/null)
  if [ "$code" = "$exp" ]; then echo "  PASS  $name ($code)"; pass=$((pass+1)); else echo "  FAIL  $name (got $code, want $exp)"; fail=$((fail+1)); fi
}

echo "== Target: $BASE =="
echo "-- Public (Phase 0/2) --"
check "GET /healthz"                 200 GET /healthz
check "GET /categories"              200 GET /categories
check "GET /categories/:slug"        200 GET /categories/kitchen-sinks
check "GET /categories/:slug 404"    404 GET /categories/nope-xyz
check "GET /products"                200 GET "/products?limit=3"
check "GET /products/:slug"          200 GET /products/lavender-imported-range-single-bowl
check "GET /products/:slug 404"      404 GET /products/nope-xyz
check "GET /products/by-category"    200 GET /products/by-category/kitchen-sinks
check "GET /search"                  200 GET "/search?q=sink"
check "GET /home"                    200 GET /home
check "GET /settings"                200 GET /settings

echo "-- Admin (Phase 1) --"
TOKEN=$(curl -s -X POST "$BASE/admin/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then echo "  PASS  admin login"; pass=$((pass+1)); else echo "  FAIL  admin login"; fail=$((fail+1)); fi
check "GET /admin/products"          200 GET "/admin/products?limit=2" "" "$TOKEN"
check "GET /admin/products no-auth"  401 GET /admin/products
check "GET /admin/categories"        200 GET /admin/categories "" "$TOKEN"
check "GET /admin/home"              200 GET /admin/home "" "$TOKEN"
check "GET /admin/settings"          200 GET /admin/settings "" "$TOKEN"
check "GET /admin/orders"            200 GET /admin/orders "" "$TOKEN"
check "GET /admin/audit-log"         200 GET /admin/audit-log "" "$TOKEN"

echo "-- Customer auth + cart (Phase 3) --"
check "POST /auth/otp/send"          200 POST /auth/otp/send "{\"phone\":\"$PHONE\"}"
check "POST /auth/otp/send bad"      400 POST /auth/otp/send '{"phone":"x"}'
check "GET /me no-auth"              401 GET /me
check "GET /me/cart no-auth"         401 GET /me/cart

echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
