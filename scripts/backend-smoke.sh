#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api/v1}"
PASSWORD="${SMOKE_PASSWORD:-Admin1234!}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

login() {
  local email="$1"
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" | jq -er '.accessToken'
}

create_report() {
  local token="$1"
  local asset_id="$2"
  local description="$3"
  local urgency="$4"

  curl -sS -X POST "$BASE_URL/reports" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"assetId\":\"$asset_id\",\"description\":\"$description\",\"urgencyPerception\":\"$urgency\"}"
}

require_command curl
require_command jq

ADMIN_TOKEN="$(login admin@gmao.local)"
SUPERVISOR_TOKEN="$(login supervisor@gmao.local)"
TECH_TOKEN="$(login tech@gmao.local)"

ASSET_ID="$(curl -sS "$BASE_URL/assets" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -er '.data[0].id')"

if [[ -z "$ASSET_ID" ]]; then
  echo "No asset found to use for report smoke tests." >&2
  exit 1
fi

echo "Using asset: $ASSET_ID"
echo "Using seeded login accounts for auth checks"

echo
echo "=== Report A: submit -> comment -> acknowledge -> convert ==="
REPORT_A_RESPONSE="$(create_report "$TECH_TOKEN" "$ASSET_ID" "Smoke test report A - convert flow" "MACHINE_STOPPED")"
REPORT_A_ID="$(echo "$REPORT_A_RESPONSE" | jq -er '.id')"
echo "$REPORT_A_RESPONSE" | jq '{id, referenceNumber, status, urgencyPerception}'

COMMENT_RESPONSE="$(curl -sS -X POST "$BASE_URL/reports/$REPORT_A_ID/comments" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Smoke test comment for report A"}')"
COMMENT_ID="$(echo "$COMMENT_RESPONSE" | jq -er '.id')"
echo "$COMMENT_RESPONSE" | jq '{id, content, acknowledgedBySupervisor}'

curl -sS -X PATCH "$BASE_URL/reports/$REPORT_A_ID/comments/$COMMENT_ID/acknowledge" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq '{id, acknowledgedBySupervisor}'

curl -sS -X POST "$BASE_URL/reports/$REPORT_A_ID/convert" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority":"HIGH","description":"Converted from smoke test report A","internalNotes":"Smoke test conversion","estimatedDurationMinutes":45}' \
  | jq '{report: {id: .report.id, status: .report.status, replacedByWorkOrderRef: .report.replacedByWorkOrderRef}, workOrder: {id: .workOrder.id, referenceNumber: .workOrder.referenceNumber, status: .workOrder.status, sourceReportId: .workOrder.sourceReportId}}'

echo
echo "=== Report B: submit -> defer -> reopen -> archive ==="
REPORT_B_RESPONSE="$(create_report "$TECH_TOKEN" "$ASSET_ID" "Smoke test report B - defer flow" "ABNORMAL_BEHAVIOR")"
REPORT_B_ID="$(echo "$REPORT_B_RESPONSE" | jq -er '.id')"
echo "$REPORT_B_RESPONSE" | jq '{id, referenceNumber, status, urgencyPerception}'

curl -sS -X PATCH "$BASE_URL/reports/$REPORT_B_ID/defer" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"Deferred during smoke test"}' | jq '{id, status, deferredAt}'

curl -sS -X PATCH "$BASE_URL/reports/$REPORT_B_ID/reopen" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq '{id, status}'

curl -sS -X PATCH "$BASE_URL/reports/$REPORT_B_ID/archive" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"archiveReason":"MANAGEMENT_DECISION"}' | jq '{id, status, archiveReason}'

echo
echo "=== Report C: submit -> reject ==="
REPORT_C_RESPONSE="$(create_report "$TECH_TOKEN" "$ASSET_ID" "Smoke test report C - reject flow" "MINOR_ISSUE")"
REPORT_C_ID="$(echo "$REPORT_C_RESPONSE" | jq -er '.id')"
echo "$REPORT_C_RESPONSE" | jq '{id, referenceNumber, status, urgencyPerception}'

curl -sS -X PATCH "$BASE_URL/reports/$REPORT_C_ID/reject" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"INVALID_REPORT","detail":"Rejected by smoke test"}' | jq '{id, status, rejectionReason, rejectionDetail}'

echo
echo "=== Verify listing and details ==="
curl -sS "$BASE_URL/reports?search=Smoke%20test%20report&page=1&limit=10" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq '{total, data: [.data[] | {id, referenceNumber, status, urgencyPerception}]}'

curl -sS "$BASE_URL/reports/$REPORT_A_ID" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq '{id, referenceNumber, status, comments: (.comments | length), derivedWorkOrders: (.derivedWorkOrders | length)}'

echo
echo "Smoke test complete. Reports module was exercised successfully."