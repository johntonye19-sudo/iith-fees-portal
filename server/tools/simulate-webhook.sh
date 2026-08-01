#!/usr/bin/env bash
# simulate-webhook.sh — compute Paystack HMAC and POST a test payload to /api/paystack/webhook
# Usage: ./simulate-webhook.sh [webhook-secret] [payload-file] [server-url]
# Example: ./simulate-webhook.sh sk_test_... server/test-payload.json http://localhost:3000

set -euo pipefail

WEBHOOK_SECRET=${1:-""}
PAYLOAD_FILE=${2:-server/test-payload.json}
SERVER_URL=${3:-http://localhost:3000}

if [ -z "$WEBHOOK_SECRET" ]; then
  echo "ERROR: webhook secret must be provided as first argument"
  exit 2
fi

if [ ! -f "$PAYLOAD_FILE" ]; then
  echo "ERROR: payload file not found: $PAYLOAD_FILE"
  exit 2
fi

# Compute HMAC-SHA512 signature (hex)
SIG=$(openssl dgst -sha512 -hmac "$WEBHOOK_SECRET" -binary "$PAYLOAD_FILE" | xxd -p -c 256)

echo "Posting payload $PAYLOAD_FILE to $SERVER_URL/api/paystack/webhook"
curl -v -X POST "$SERVER_URL/api/paystack/webhook" \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: $SIG" \
  --data-binary "@$PAYLOAD_FILE"

echo "Done"
