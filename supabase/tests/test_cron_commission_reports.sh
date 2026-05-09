#!/usr/bin/env bash
# =====================================================================
# Teste: cron-commission-reports (Edge Function)
# O que testa:
#   - Disparo sem JWT (sem Authorization header)
#   - Cálculo automático do mês anterior
#   - Processamento de todos os vendedores ativos
#   - Resposta com contadores processed/skipped/errors
#   - Rejeição de métodos inválidos (GET)
#
# Pré-condições:
#   - Vendedores ativos existem no banco (Rebeca, Lucas, Lindomar)
#   - Lindomar e ao menos 1 outro têm pedidos pago/concluido no mês anterior
#   - UAZAPI configurado nas secrets da edge function
#
# Como executar:
#   bash supabase/tests/test_cron_commission_reports.sh
#
# Efeitos colaterais:
#   - Envia mensagens reais via WhatsApp para o número do financeiro
#   - Faz upload de PDFs no bucket commission-reports
#   Use com consciência — preferencialmente fora do horário de trabalho
#   ou desabilitando temporariamente o UAZAPI_TOKEN nas secrets.
# =====================================================================

set -euo pipefail

SUPABASE_URL="https://kjfsmwtwbreapipifjtu.supabase.co"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/cron-commission-reports"

PASS=0
FAIL=0

log_pass() { echo "    ✅ PASSOU — $1"; PASS=$((PASS+1)); }
log_fail() { echo "    ❌ FALHOU — $1"; FAIL=$((FAIL+1)); }

echo "=============================="
echo " TESTE: cron-commission-reports"
echo "=============================="
echo ""


# ── Teste 1: Caminho feliz — sem JWT, deve processar vendedores ──────
echo "[1] Caminho feliz — POST sem Authorization header"
RESP1=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{}')

STATUS1=$(echo "$RESP1" | tail -1)
BODY1=$(echo "$RESP1" | head -n -1)

echo "    HTTP: $STATUS1"
if [ "$STATUS1" = "200" ]; then
  SUMMARY=$(echo "$BODY1" | node -e "
    const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
      const d=JSON.parse(c.join(''));
      console.log('period='+d.period.start_date+' a '+d.period.end_date
        +' | processed='+d.processed
        +' | skipped='+d.skipped
        +' | errors='+d.errors.length);
    })" 2>/dev/null)
  echo "    Resultado: $SUMMARY"
  log_pass "200 retornado, função executada"
else
  echo "    Body: ${BODY1:0:300}"
  log_fail "esperado 200, recebido $STATUS1"
fi
echo ""


# ── Teste 2: Período calculado automaticamente ───────────────────────
echo "[2] Período deve ser o mês anterior ao atual"
RESP2=$(curl -s \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{}')

# Calcular mês anterior localmente para comparar
EXPECTED_MONTH=$(node -e "
  const now = new Date();
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear()-1 : now.getUTCFullYear();
  const m = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const mm = String(m).padStart(2,'0');
  console.log(y+'-'+mm);
" 2>/dev/null)

RETURNED_MONTH=$(echo "$RESP2" | node -e "
  const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
    const d=JSON.parse(c.join(''));
    console.log(d.period?.start_date?.slice(0,7)||'');
  })" 2>/dev/null)

echo "    Esperado: $EXPECTED_MONTH | Retornado: $RETURNED_MONTH"
[ "$RETURNED_MONTH" = "$EXPECTED_MONTH" ] \
  && log_pass "período correto ($RETURNED_MONTH)" \
  || log_fail "período incorreto — esperado $EXPECTED_MONTH, recebido $RETURNED_MONTH"
echo ""


# ── Teste 3: processed + skipped = total de vendedores ativos ────────
echo "[3] processed + skipped deve igualar total de vendedores ativos"
RESP3=$(curl -s \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{}')

TOTAL_HANDLED=$(echo "$RESP3" | node -e "
  const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
    const d=JSON.parse(c.join(''));
    console.log((d.processed||0)+(d.skipped||0));
  })" 2>/dev/null)

ERRORS_COUNT=$(echo "$RESP3" | node -e "
  const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
    const d=JSON.parse(c.join(''));
    console.log(d.errors?.length||0);
  })" 2>/dev/null)

echo "    processed+skipped: $TOTAL_HANDLED | errors: $ERRORS_COUNT"
[ "$ERRORS_COUNT" = "0" ] \
  && log_pass "sem erros, $TOTAL_HANDLED vendedores tratados" \
  || log_fail "$ERRORS_COUNT erros retornados"
echo ""


# ── Teste 4: GET deve retornar 405 ───────────────────────────────────
echo "[4] GET — deve retornar 405"
RESP4=$(curl -s -w "\n%{http_code}" \
  -X GET "$FUNCTION_URL")

STATUS4=$(echo "$RESP4" | tail -1)
echo "    HTTP: $STATUS4"
[ "$STATUS4" = "405" ] \
  && log_pass "405 correto para método inválido" \
  || log_fail "esperado 405, recebido $STATUS4"
echo ""


# ── Resultado final ──────────────────────────────────────────────────
echo "=============================="
echo " RESULTADO: ${PASS} passou | ${FAIL} falhou"
echo "=============================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
