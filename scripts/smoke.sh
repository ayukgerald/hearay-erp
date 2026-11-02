#!/usr/bin/env bash
# Task 5 check: create and pay an order against FakeProvider using curl.
# Usage: scripts/smoke.sh [base_url]   (server must run with PAYMENT_PROVIDER=fake)
set -euo pipefail
BASE=${1:-http://localhost:3000}
PKG=$(curl -sf "$BASE/api/packages" | python3 -c 'import sys,json;p=json.load(sys.stdin)["packages"];print(p[0]["id"] if p else "")')
[ -n "$PKG" ] || { echo "No active packages: set a price and show one in /admin/packages"; exit 1; }
PHONE=${PHONE:-6$(printf '%08d' $((RANDOM*RANDOM % 100000000)) | sed 's/0$/1/')}
echo "== create order (client sends totalXaf=1, must be ignored)"
R=$(curl -sf -X POST "$BASE/api/orders" -H 'content-type: application/json' \
  -d "{\"smartcardNumber\":\"1234567890\",\"smartcardConfirm\":\"1234567890\",\"packageId\":\"$PKG\",\"months\":3,\"phone\":\"$PHONE\",\"paymentMethod\":\"mtn_momo\",\"totalXaf\":1}")
echo "$R"
ID=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "== start payment"
curl -s -X POST "$BASE/api/orders/$ID/pay"; echo
for i in $(seq 1 8); do
  S=$(curl -sf "$BASE/api/orders/$ID" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"], d["paymentStatus"])')
  echo "poll $i: $S"; [[ $S == paid* ]] && break; sleep 3
done
echo "== receipt: $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/orders/$ID/receipt")"
