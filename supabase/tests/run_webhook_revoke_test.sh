#!/usr/bin/env bash
# Executa os testes de revoke EXECUTE das funções de webhook
# Pré-condição: npx supabase login já executado (token salvo)
# Uso: bash supabase/tests/run_webhook_revoke_test.sh

set -euo pipefail

PROJECT_REF="kjfsmwtwbreapipifjtu"
PASS=0
FAIL=0

run_query() {
  local label="$1"
  local sql="$2"
  local expected_rows="${3:-0}"

  result=$(npx supabase --experimental snippets execute \
    --project-ref "$PROJECT_REF" \
    --sql "$sql" 2>&1) || true

  row_count=$(echo "$result" | grep -c '|' || echo "0")

  if [[ "$row_count" -eq "$expected_rows" ]]; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (esperado $expected_rows linha(s), obteve $row_count)"
    echo "         $result"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Teste: REVOKE EXECUTE funções de webhook ==="
echo ""

run_query \
  "PUBLIC nao tem EXECUTE em build_partner_order_payload" \
  "SELECT 1 FROM pg_proc WHERE proname='build_partner_order_payload' AND has_function_privilege('public', oid, 'EXECUTE');" \
  0

run_query \
  "PUBLIC nao tem EXECUTE em send_pending_partner_order_webhooks" \
  "SELECT 1 FROM pg_proc WHERE proname='send_pending_partner_order_webhooks' AND has_function_privilege('public', oid, 'EXECUTE');" \
  0

run_query \
  "Funcao build_partner_order_payload existe com SECURITY DEFINER" \
  "SELECT 1 FROM pg_proc WHERE proname='build_partner_order_payload' AND prosecdef = true;" \
  1

run_query \
  "Funcao send_pending_partner_order_webhooks existe com SECURITY DEFINER" \
  "SELECT 1 FROM pg_proc WHERE proname='send_pending_partner_order_webhooks' AND prosecdef = true;" \
  1

echo ""
echo "=== Resultado: $PASS passou(ram), $FAIL falhou(ram) ==="
echo ""

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
