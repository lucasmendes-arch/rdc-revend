#!/bin/bash
# ============================================================
# Registrar webhook do Telegram apontando para a Vercel
# Uso: TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy VERCEL_URL=baseop.vercel.app bash scripts/setup-telegram-webhook.sh
# ============================================================

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_WEBHOOK_SECRET" ] || [ -z "$VERCEL_URL" ]; then
  echo "Defina TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e VERCEL_URL"
  exit 1
fi

WEBHOOK_URL="https://${VERCEL_URL}/api/telegram/webhook"

echo "Registrando webhook: $WEBHOOK_URL"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\"]
  }" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "Verificando:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool 2>/dev/null || cat
