#!/usr/bin/env node

/**
 * Script para obter/renovar access token da Nuvemshop (Tienda Nube)
 *
 * Uso:
 * node scripts/get-nuvemshop-token.js <client_id> <client_secret> <code>
 *
 * Exemplo:
 * node scripts/get-nuvemshop-token.js 25931 "70e73f4697d6bc34f503b55cd6103468fa35f891de7ad0d3" "663ee3753ec02abf9c1e64c121c7b5ad21cf97f9"
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('❌ Argumentos insuficientes\n');
  console.log('Uso:');
  console.log('  node scripts/get-nuvemshop-token.js <client_id> <client_secret> <code>');
  console.log('\nExemplo:');
  console.log('  node scripts/get-nuvemshop-token.js 25931 "70e73f..." "663ee3..."\n');
  console.log('Variáveis de ambiente (alternativa):');
  console.log('  NUVEMSHOP_CLIENT_ID');
  console.log('  NUVEMSHOP_CLIENT_SECRET');
  console.log('  NUVEMSHOP_AUTH_CODE\n');
  process.exit(1);
}

const clientId = args[0] || process.env.NUVEMSHOP_CLIENT_ID;
const clientSecret = args[1] || process.env.NUVEMSHOP_CLIENT_SECRET;
const code = args[2] || process.env.NUVEMSHOP_AUTH_CODE;

if (!clientId || !clientSecret || !code) {
  console.error('❌ Faltam parâmetros obrigatórios\n');
  console.log('Disponibilize:');
  if (!clientId) console.log('  - client_id (ou NUVEMSHOP_CLIENT_ID)');
  if (!clientSecret) console.log('  - client_secret (ou NUVEMSHOP_CLIENT_SECRET)');
  if (!code) console.log('  - code (ou NUVEMSHOP_AUTH_CODE)');
  console.log();
  process.exit(1);
}

const payload = JSON.stringify({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: 'authorization_code',
  code: code,
});

const options = {
  hostname: 'www.tiendanube.com',
  port: 443,
  path: '/apps/authorize/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
};

console.log('🔐 Obtendo token da Nuvemshop...\n');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);

      if (res.statusCode === 200 && response.access_token) {
        console.log('✅ Token obtido com sucesso!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📦 Access Token:`);
        console.log(response.access_token);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (response.user_id) {
          console.log(`👤 User ID: ${response.user_id}`);
        }
        if (response.expires_in) {
          console.log(`⏱️  Expira em: ${response.expires_in}s (${Math.floor(response.expires_in / 3600)}h)`);
        }
        console.log();

        // Perguntar se quer salvar/atualizar no Supabase
        console.log('💾 Próximas ações:\n');
        console.log('1️⃣  Copie o token acima\n');
        console.log('2️⃣  Atualize no Supabase com:');
        console.log('   npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN="<token>"\n');
        console.log('3️⃣  Deploy a edge function:');
        console.log('   npx supabase functions deploy sync-nuvemshop\n');
      } else {
        console.error('❌ Erro ao obter token\n');
        console.error('Status:', res.statusCode);
        console.error('Response:', JSON.stringify(response, null, 2));
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Erro ao processar resposta\n');
      console.error('Resposta bruta:', data);
      console.error('Erro:', error.message);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro na requisição\n');
  console.error(error.message);
  process.exit(1);
});

req.write(payload);
req.end();
