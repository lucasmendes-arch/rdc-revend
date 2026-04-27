#!/usr/bin/env node
// ============================================================
// test_create_order_auto.js
//
// Teste totalmente automatizado da edge function create-order.
// Lê credenciais do .env.local, busca produtos reais, cria
// usuário de teste temporário, roda os casos e limpa tudo.
//
// Casos cobertos:
//   1. CORS preflight (OPTIONS)         → 200 + Access-Control-Allow-Origin
//   2. POST sem Authorization           → 401
//   3. Carrinho vazio                   → 400
//   4. Total abaixo do mínimo (R$500)   → 400
//   5. pay_on_delivery p/ não-parceiro  → 400
//   6. Caminho feliz (pix + shipping)   → 201 + order_id + payment_url
//
// Como executar:
//   node supabase/tests/test_create_order_auto.js
// ============================================================

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Carregar .env.local ──────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const ENV           = loadEnv();
const SUPABASE_URL  = ENV.VITE_SUPABASE_URL;
const ANON_KEY      = ENV.ANON_PUBLIC;
const SERVICE_ROLE  = ENV.SERVICE_ROLE_KEY ?? ENV.SERVICE_ROLE;
const FUNCTION_URL  = `${SUPABASE_URL}/functions/v1/create-order`;
const ORIGIN        = 'https://rdc-revend.vercel.app';
const TEST_EMAIL    = 'bot-test-create-order@test.internal';
const TEST_PASSWORD = 'CreateOrder@Test2026!';

// ── HTTP helper ──────────────────────────────────────────────
function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function optionsRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: 'OPTIONS', hostname: u.hostname, path: u.pathname + u.search, headers },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Resultado ────────────────────────────────────────────────
let PASS = 0, FAIL = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    PASS++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    FAIL++;
  }
}

// ── Setup: buscar produtos ───────────────────────────────────
async function fetchProducts() {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

  // Produto mais caro — calcula qty para atingir R$500 mínimo
  const expRes = await request('GET',
    `${SUPABASE_URL}/rest/v1/catalog_products?select=id,name,price&is_active=eq.true&order=price.desc&limit=1`,
    { headers });

  // Produto mais barato — qty=1 deve ficar abaixo de R$500
  const cheapRes = await request('GET',
    `${SUPABASE_URL}/rest/v1/catalog_products?select=id,name,price&is_active=eq.true&order=price.asc&limit=1`,
    { headers });

  const expensive = expRes.body?.[0];
  const cheap     = cheapRes.body?.[0];

  if (!expensive) throw new Error('Catálogo vazio ou inacessível.');
  if (!cheap)     throw new Error('Catálogo vazio ou inacessível.');

  // qty mínima para atingir R$500 com o produto mais caro
  const MIN = 500;
  const qtyNeeded = Math.ceil(MIN / Number(expensive.price));

  // produto "abaixo do mínimo": qty=1 do mais barato só funciona se price < 500
  // se o mais barato já for >= 500, é um edge case improvável — usamos price < 500 explicitamente
  if (Number(cheap.price) >= MIN) {
    throw new Error(`Produto mais barato (R$${cheap.price}) já excede o mínimo de R$${MIN}. Cenário de teste inválido.`);
  }

  return {
    bigProduct:   { ...expensive, qty: qtyNeeded },
    cheapProduct: { ...cheap,     qty: 1 },
  };
}

// ── Setup: criar usuário de teste ────────────────────────────
async function createTestUser() {
  await deleteTestUser().catch(() => {});

  const res = await request('POST',
    `${SUPABASE_URL}/auth/v1/admin/users`,
    {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true },
    }
  );
  if (res.status !== 200) throw new Error(`Falha ao criar usuário de teste: ${res.raw}`);
  return res.body.id;
}

// ── Setup: login e JWT ────────────────────────────────────────
async function signIn() {
  const res = await request('POST',
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: ANON_KEY },
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    }
  );
  if (!res.body?.access_token) throw new Error(`Login falhou: ${res.raw}`);
  return res.body.access_token;
}

// ── Cleanup: remover pedidos de teste ────────────────────────
async function cleanupOrders() {
  const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, Prefer: 'return=minimal' };

  const orders = await request('GET',
    `${SUPABASE_URL}/rest/v1/orders?select=id&customer_email=eq.${encodeURIComponent(TEST_EMAIL)}`,
    { headers });

  for (const { id } of (orders.body || [])) {
    await request('DELETE', `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${id}`, { headers });
    await request('DELETE', `${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, { headers });
  }
}

// ── Cleanup: remover usuário de teste ────────────────────────
async function deleteTestUser() {
  const res = await request('GET',
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(TEST_EMAIL)}`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
  );
  const userId = res.body?.users?.[0]?.id;
  if (!userId) return;

  await request('DELETE',
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
  );
}

// ── Testes ────────────────────────────────────────────────────
async function runTests(jwt, bigProduct, cheapProduct) {

  // Teste 1: CORS Preflight
  console.log('\n--- Teste 1: CORS Preflight (OPTIONS) ---');
  const t1 = await optionsRequest(FUNCTION_URL, {
    Origin: ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  });
  check('OPTIONS retorna 200', t1.status === 200, `HTTP ${t1.status}`);
  check('Access-Control-Allow-Origin presente', !!t1.headers['access-control-allow-origin']);
  check('Métodos permitidos incluem POST', (t1.headers['access-control-allow-methods'] || '').includes('POST'));

  // Teste 2: Sem Authorization (gateway ou função retorna 401 — aceita ambos os formatos)
  console.log('\n--- Teste 2: POST sem Authorization ---');
  const t2 = await request('POST', FUNCTION_URL, {
    body: { items: [{ product_id: bigProduct.id, qty: bigProduct.qty }], customer_name: 'X', customer_whatsapp: '27999990000', customer_email: 'x@x.com', payment_method: 'pix' },
  });
  check('Sem auth retorna 401', t2.status === 401, `HTTP ${t2.status}`);
  // Aceita tanto o formato da função ("Token de autenticação ausente") quanto do gateway ("Missing authorization header")
  check('Mensagem de auth ausente', /autenti|authorization|header/i.test(t2.raw), t2.raw);

  // Detecção de verify_jwt ativo (gateway rejeitando ES256)
  const jwtBlocked = /UNSUPPORTED_TOKEN_ALGORITHM|ES256/i.test('');
  const probeRes = await request('POST', FUNCTION_URL, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: { items: [], customer_name: 'X', customer_whatsapp: '0', customer_email: 'x@x.com', payment_method: 'pix' },
  });
  const gatewayBlocking = /UNSUPPORTED_TOKEN_ALGORITHM|ES256/i.test(probeRes.raw);
  if (gatewayBlocking) {
    console.log('\n⚠️  ATENÇÃO: gateway está com verify_jwt=true e rejeita tokens ES256.');
    console.log('   Fix: deploy da função com verify_jwt=false ainda não aplicado em produção.');
    console.log('   Execute: supabase functions deploy create-order');
    console.log('   Ou: Dashboard > Edge Functions > create-order > desativar "Require JWT"\n');
    console.log('   Testes 3-6 são PULADOS até o deploy ser feito.\n');
    return;
  }

  // Teste 3: Carrinho vazio
  console.log('\n--- Teste 3: Carrinho vazio ---');
  const t3 = await request('POST', FUNCTION_URL, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: { items: [], customer_name: 'Teste', customer_whatsapp: '27999990000', customer_email: TEST_EMAIL, payment_method: 'pix' },
  });
  check('Carrinho vazio retorna 400', t3.status === 400, `HTTP ${t3.status}`);
  check("Mensagem 'Carrinho vazio'", /carrinho vazio/i.test(t3.raw), t3.raw);

  // Teste 4: Total abaixo do mínimo
  console.log(`\n--- Teste 4: Total abaixo do mínimo (produto: "${cheapProduct.name}" R$${cheapProduct.price}) ---`);
  const t4 = await request('POST', FUNCTION_URL, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: { items: [{ product_id: cheapProduct.id, qty: 1 }], customer_name: 'Teste', customer_whatsapp: '27999990000', customer_email: TEST_EMAIL, payment_method: 'pix' },
  });
  check('Abaixo do mínimo retorna 400', t4.status === 400, `HTTP ${t4.status}`);
  check("Mensagem 'Pedido mínimo'", /pedido m[íi]nimo/i.test(t4.raw), t4.raw);

  // Teste 5: pay_on_delivery para não-parceiro
  console.log('\n--- Teste 5: pay_on_delivery para não-network_partner ---');
  const t5 = await request('POST', FUNCTION_URL, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: { items: [{ product_id: bigProduct.id, qty: bigProduct.qty }], customer_name: 'Teste', customer_whatsapp: '27999990000', customer_email: TEST_EMAIL, payment_method: 'pay_on_delivery' },
  });
  check('pay_on_delivery bloqueado retorna 400', t5.status === 400, `HTTP ${t5.status}`);
  check('Mensagem método inválido', /inv[aá]lido/i.test(t5.raw), t5.raw);

  // Teste 6: Caminho feliz
  console.log(`\n--- Teste 6: Caminho feliz (produto: "${bigProduct.name}" R$${bigProduct.price} x${bigProduct.qty}) ---`);
  const t6 = await request('POST', FUNCTION_URL, {
    headers: { Authorization: `Bearer ${jwt}`, Origin: ORIGIN },
    body: {
      items: [{ product_id: bigProduct.id, qty: bigProduct.qty }],
      customer_name: 'Teste Automatizado',
      customer_whatsapp: '27000000001',
      customer_email: TEST_EMAIL,
      payment_method: 'pix',
      delivery_method: 'shipping',
    },
  });
  check('Pedido criado retorna 201', t6.status === 201, `HTTP ${t6.status}`);
  check('order_id presente',         !!t6.body?.order_id, t6.raw);
  check('payment_url presente',      !!t6.body?.payment_url, t6.raw);
  if (t6.body?.order_id) {
    console.log(`  order_id:    ${t6.body.order_id}`);
    console.log(`  total:       R$${t6.body.total}`);
    console.log(`  payment_url: ${t6.body.payment_url ?? '(null)'}`);
  }
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  console.log('\n=== Teste automatizado: create-order edge function ===');

  let jwt;
  try {
    process.stdout.write('\nPreparando ambiente (produtos + usuário de teste)...');
    const { bigProduct, cheapProduct } = await fetchProducts();
    await createTestUser();
    jwt = await signIn();
    console.log(' OK\n');

    await runTests(jwt, bigProduct, cheapProduct);

  } catch (err) {
    console.error(`\nErro durante setup: ${err.message}`);
    process.exitCode = 1;
  } finally {
    process.stdout.write('\nLimpando pedidos e usuário de teste...');
    try {
      await cleanupOrders();
      await deleteTestUser();
      console.log(' OK');
    } catch (err) {
      console.warn(` AVISO: limpeza parcial — ${err.message}`);
    }
  }

  console.log(`\n=== Resultado: ${PASS} passou(ram), ${FAIL} falhou(ram) ===\n`);
  if (FAIL > 0) process.exitCode = 1;
})();
