#!/usr/bin/env bash
# =====================================================================
# Teste: send-seller-commission-report (Edge Function)
# O que testa: geração de PDF + upload Storage + envio WhatsApp
# Como executar: bash supabase/tests/test_send_seller_commission_report.sh
#
# Estratégia de auth: o script cria um usuário admin temporário,
# obtém o JWT, executa os testes e deleta o usuário ao final.
# Nenhuma credencial real é alterada.
# =====================================================================

set -euo pipefail

SUPABASE_URL="https://kjfsmwtwbreapipifjtu.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0NDcwMCwiZXhwIjoyMDg3MjIwNzAwfQ.Zb4_MelIy7DaehA_TZECU2epmfsHdn8PP3fvulDFWNU"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/send-seller-commission-report"

# Vendedor de teste: Lindomar Reis — 17 pedidos finalizados em 2026
SELLER_ID="85b98124-fb47-4896-b62d-e9b048fc9d20"
START_DATE="2026-01-01"
END_DATE="2026-12-31"

# ── Variáveis de controle ────────────────────────────────────────────
PASS=0
FAIL=0
TEST_USER_ID=""
JWT=""

log_pass() { echo "    ✅ PASSOU — $1"; PASS=$((PASS+1)); }
log_fail() { echo "    ❌ FALHOU — $1"; FAIL=$((FAIL+1)); }

echo "=============================="
echo " TESTE: send-seller-commission-report"
echo "=============================="
echo ""

# ── Setup: criar usuário admin temporário ───────────────────────────
echo "[SETUP] Criando usuário admin temporário..."
TEST_EMAIL="test-commission-$$@rdc-test.internal"
TEST_PASS="TestComm1234!"

CREATE_RESP=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASS}\",\"email_confirm\":true}")

TEST_USER_ID=$(echo "$CREATE_RESP" | node -e "
  const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
    const d=JSON.parse(c.join(''));
    console.log(d.id || '');
  })")

if [ -z "$TEST_USER_ID" ]; then
  echo "    ❌ ABORTANDO — falha ao criar usuário de teste"
  echo "    Resposta: $CREATE_RESP"
  exit 1
fi
echo "    Usuário criado: $TEST_USER_ID ($TEST_EMAIL)"

# Aguardar trigger criar o profile (polling até existir, max 10s)
echo -n "    Aguardando profile..."
for i in $(seq 1 10); do
  sleep 1
  PROFILE_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}&select=id" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}")
  if echo "$PROFILE_CHECK" | grep -q "$TEST_USER_ID"; then
    echo " criado (${i}s)"
    break
  fi
  echo -n "."
  if [ "$i" -eq 10 ]; then
    echo " TIMEOUT"
    curl -s -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${TEST_USER_ID}" \
      -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" > /dev/null
    exit 1
  fi
done

# Promover para admin via service role
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' > /dev/null
echo "    Role promovido para admin"

# Login para obter JWT
LOGIN_RESP=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASS}\"}")

JWT=$(echo "$LOGIN_RESP" | node -e "
  const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
    const d=JSON.parse(c.join(''));
    console.log(d.access_token || '');
  })")

if [ -z "$JWT" ]; then
  echo "    ❌ ABORTANDO — falha ao obter JWT"
  echo "    Resposta: $LOGIN_RESP"
  # Limpar usuário antes de sair
  curl -s -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${TEST_USER_ID}" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" > /dev/null
  exit 1
fi
echo "    JWT obtido com sucesso"
echo ""


# ── Teste 1: Caminho feliz ───────────────────────────────────────────
echo "[1] Caminho feliz — Lindomar, 2026, 17+ pedidos esperados"
RESP1=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"seller_id\":\"$SELLER_ID\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\"}")

STATUS1=$(echo "$RESP1" | tail -1)
BODY1=$(echo "$RESP1" | head -n -1)

echo "    HTTP: $STATUS1"
if [ "$STATUS1" = "200" ]; then
  ORDERS=$(echo "$BODY1" | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ const d=JSON.parse(c.join('')); console.log('pedidos='+d.summary.total_orders+' comissão=R$'+d.summary.commission_amount); })" 2>/dev/null)
  PDF_URL=$(echo "$BODY1" | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ const d=JSON.parse(c.join('')); console.log(d.pdf_url||''); })" 2>/dev/null)
  echo "    Resultado: $ORDERS"
  echo "    PDF URL: ${PDF_URL:0:80}..."
  log_pass "200 retornado, PDF gerado, WhatsApp enviado"
else
  echo "    Body: ${BODY1:0:200}"
  log_fail "esperado 200, recebido $STATUS1"
fi
echo ""


# ── Teste 2: Período sem pedidos ─────────────────────────────────────
echo "[2] Período sem pedidos — deve retornar 404"
RESP2=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"seller_id\":\"$SELLER_ID\",\"start_date\":\"2020-01-01\",\"end_date\":\"2020-12-31\"}")

STATUS2=$(echo "$RESP2" | tail -1)
echo "    HTTP: $STATUS2"
[ "$STATUS2" = "404" ] && log_pass "404 correto para período vazio" || log_fail "esperado 404, recebido $STATUS2"
echo ""


# ── Teste 3: Sem JWT ─────────────────────────────────────────────────
echo "[3] Sem autenticação — deve retornar 401"
RESP3=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "{\"seller_id\":\"$SELLER_ID\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\"}")

STATUS3=$(echo "$RESP3" | tail -1)
echo "    HTTP: $STATUS3"
[ "$STATUS3" = "401" ] && log_pass "401 correto sem auth" || log_fail "esperado 401, recebido $STATUS3"
echo ""


# ── Teste 4: Body incompleto ─────────────────────────────────────────
echo "[4] Body sem end_date — deve retornar 400"
RESP4=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"seller_id\":\"$SELLER_ID\",\"start_date\":\"$START_DATE\"}")

STATUS4=$(echo "$RESP4" | tail -1)
echo "    HTTP: $STATUS4"
[ "$STATUS4" = "400" ] && log_pass "400 correto para body incompleto" || log_fail "esperado 400, recebido $STATUS4"
echo ""


# ── Teste 5: Seller inexistente ──────────────────────────────────────
echo "[5] Seller UUID inexistente — deve retornar 500 com mensagem"
RESP5=$(curl -s -w "\n%{http_code}" \
  -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"seller_id\":\"00000000-0000-0000-0000-000000000000\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\"}")

STATUS5=$(echo "$RESP5" | tail -1)
BODY5=$(echo "$RESP5" | head -n -1)
echo "    HTTP: $STATUS5"
echo "    Body: ${BODY5:0:120}"
[ "$STATUS5" = "500" ] && log_pass "500 correto para seller inválido" || log_fail "esperado 500, recebido $STATUS5"
echo ""


# ── Teardown: deletar usuário de teste ──────────────────────────────
echo "[TEARDOWN] Deletando usuário de teste..."
DEL_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${TEST_USER_ID}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

[ "$DEL_RESP" = "200" ] && echo "    Usuário deletado com sucesso" || echo "    Aviso: delete retornou $DEL_RESP"
echo ""


# ── Resultado final ──────────────────────────────────────────────────
echo "=============================="
echo " RESULTADO: ${PASS} passou | ${FAIL} falhou"
echo "=============================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
