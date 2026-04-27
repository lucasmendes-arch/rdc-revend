#!/usr/bin/env bash
# ============================================================
# test_create_order.sh
#
# O que testa: edge function create-order (fluxo completo + edge cases)
# Casos cobertos:
#   1. CORS preflight (OPTIONS)          → 200 + Access-Control-Allow-Origin
#   2. POST sem Authorization            → 401
#   3. Carrinho vazio                    → 400
#   4. Total abaixo do mínimo (R$500)    → 400
#   5. pay_on_delivery p/ não-parceiro   → 400
#   6. Caminho feliz (pix + shipping)    → 201 + order_id + payment_url
#
# Pré-condições:
#   - USER_JWT: JWT de usuário autenticado com customer_segment != 'network_partner'
#   - PRODUCT_ID_BIG: UUID de produto ativo com price >= R$500
#   - PRODUCT_ID_CHEAP: UUID de produto ativo com price < R$500
#   - Edge function deployada com verify_jwt=false (config.toml atualizado)
#
# Como obter USER_JWT:
#   No browser logado: DevTools > Application > Local Storage >
#   chave supabase.auth.token > copie o valor de access_token
#
# Como executar:
#   bash supabase/tests/test_create_order.sh
#
# ⚠️  O teste 6 CRIA um pedido real e decrementa estoque.
#     Execute a limpeza SQL exibida ao final do script.
# ============================================================

SUPABASE_URL="https://kjfsmwtwbreapipifjtu.supabase.co"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/create-order"
ORIGIN="https://rdc-revend.vercel.app"

# === PREENCHER ANTES DE RODAR ===
USER_JWT="eyJ..."           # JWT do usuário autenticado (não network_partner)
PRODUCT_ID_BIG="<uuid>"    # Produto ativo com price >= R$500
PRODUCT_ID_CHEAP="<uuid>"  # Produto ativo com price < R$500 (ex: R$10)
# ================================

PASS=0
FAIL=0

check_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS  $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (esperado HTTP $expected, obteve HTTP $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_body() {
  local label="$1"
  local needle="$2"
  local body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (não encontrou '$needle' em: $body)"
    FAIL=$((FAIL + 1))
  fi
}

check_header() {
  local label="$1"
  local needle="$2"
  local headers="$3"
  if echo "$headers" | grep -qi "$needle"; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (não encontrou '$needle' nos headers)"
    FAIL=$((FAIL + 1))
  fi
}

# Extrai HTTP status da última linha da resposta combinada
get_status() { echo "$1" | tail -1 | sed 's/__STATUS__//'; }
get_body()   { echo "$1" | sed '$d'; }

echo ""
echo "=== Teste: create-order edge function ==="
echo ""

# --------------------------------------------------
echo "--- Teste 1: CORS Preflight (OPTIONS) ---"
# Valida que verify_jwt=false está em efeito: OPTIONS sem Auth deve retornar 200
HEADERS=$(curl -si -X OPTIONS "$FUNCTION_URL" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  2>/dev/null || true)
STATUS=$(echo "$HEADERS" | head -1 | grep -o '[0-9]\{3\}' | head -1)
check_status "OPTIONS sem auth retorna 200" "200" "$STATUS"
check_header "Access-Control-Allow-Origin presente" "Access-Control-Allow-Origin" "$HEADERS"
check_header "Metodos permitidos incluem POST" "POST" "$HEADERS"

# --------------------------------------------------
echo ""
echo "--- Teste 2: POST sem Authorization ---"
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":\"$PRODUCT_ID_BIG\",\"qty\":1}],\"customer_name\":\"Teste\",\"customer_whatsapp\":\"27999990000\",\"customer_email\":\"teste@test.com\",\"payment_method\":\"pix\"}" \
  2>/dev/null || true)
check_status "Sem auth retorna 401" "401" "$(get_status "$RESP")"
check_body "Mensagem de erro de auth" "autenti" "$(get_body "$RESP")"

# --------------------------------------------------
echo ""
echo "--- Teste 3: Carrinho vazio ---"
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[],\"customer_name\":\"Teste\",\"customer_whatsapp\":\"27999990000\",\"customer_email\":\"teste@test.com\",\"payment_method\":\"pix\"}" \
  2>/dev/null || true)
check_status "Carrinho vazio retorna 400" "400" "$(get_status "$RESP")"
check_body "Mensagem 'Carrinho vazio'" "Carrinho vazio" "$(get_body "$RESP")"

# --------------------------------------------------
echo ""
echo "--- Teste 4: Total abaixo do mínimo (R\$500) ---"
# PRODUCT_ID_CHEAP deve ser produto ativo com price < 500
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":\"$PRODUCT_ID_CHEAP\",\"qty\":1}],\"customer_name\":\"Teste\",\"customer_whatsapp\":\"27999990000\",\"customer_email\":\"teste@test.com\",\"payment_method\":\"pix\"}" \
  2>/dev/null || true)
check_status "Abaixo do mínimo retorna 400" "400" "$(get_status "$RESP")"
check_body "Mensagem pedido mínimo" "Pedido" "$(get_body "$RESP")"

# --------------------------------------------------
echo ""
echo "--- Teste 5: pay_on_delivery para nao-network_partner ---"
# Requer que USER_JWT seja de usuário com customer_segment != 'network_partner'
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":\"$PRODUCT_ID_BIG\",\"qty\":1}],\"customer_name\":\"Teste\",\"customer_whatsapp\":\"27999990000\",\"customer_email\":\"teste@test.com\",\"payment_method\":\"pay_on_delivery\"}" \
  2>/dev/null || true)
check_status "pay_on_delivery bloqueado retorna 400" "400" "$(get_status "$RESP")"
check_body "Mensagem metodo invalido" "inválido" "$(get_body "$RESP")"

# --------------------------------------------------
echo ""
echo "--- Teste 6: Caminho feliz (pix + shipping) ---"
echo "    ⚠️  Cria pedido real — execute limpeza SQL ao final"
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":\"$PRODUCT_ID_BIG\",\"qty\":1}],\"customer_name\":\"Teste Automatizado\",\"customer_whatsapp\":\"27000000001\",\"customer_email\":\"teste-auto@example.com\",\"payment_method\":\"pix\",\"delivery_method\":\"shipping\"}" \
  2>/dev/null || true)
BODY6=$(get_body "$RESP")
check_status "Pedido criado retorna 201" "201" "$(get_status "$RESP")"
check_body "order_id presente" "order_id" "$BODY6"
check_body "payment_url presente" "payment_url" "$BODY6"
echo "    Resposta: $BODY6"

# --------------------------------------------------
echo ""
echo "=== Resultado: $PASS passou(ram), $FAIL falhou(ram) ==="
echo ""
echo "--- Limpeza SQL (rodar no Supabase Dashboard > SQL Editor) ---"
echo ""
echo "-- Bloco 1: remover itens do pedido de teste"
echo "DELETE FROM order_items oi"
echo "  USING orders o"
echo "  WHERE oi.order_id = o.id"
echo "    AND o.customer_email = 'teste-auto@example.com'"
echo "    AND o.created_at > now() - interval '5 minutes';"
echo ""
echo "-- Bloco 2: remover pedido de teste e restaurar estoque manualmente se necessário"
echo "DELETE FROM orders"
echo "  WHERE customer_email = 'teste-auto@example.com'"
echo "    AND created_at > now() - interval '5 minutes';"
echo ""
echo "-- Bloco 3: verificar que limpeza funcionou (deve retornar 0 linhas)"
echo "SELECT id, status, total FROM orders"
echo "  WHERE customer_email = 'teste-auto@example.com'"
echo "    AND created_at > now() - interval '10 minutes';"
echo "--------------------------------------------------------------"

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
