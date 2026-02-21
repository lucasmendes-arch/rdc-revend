#!/usr/bin/env node

/**
 * Setup interativo para Nuvemshop Token
 * Funciona em Windows, macOS e Linux
 *
 * Uso:
 * node scripts/setup-nuvemshop.js
 */

import https from 'https';
import readline from 'readline';
import { execSync } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Nuvemshop Access Token - Setup Interativo                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Este script irá:');
  console.log('  1️⃣  Obter o access token da Nuvemshop/Tienda Nube');
  console.log('  2️⃣  Atualizar no Supabase secrets');
  console.log('  3️⃣  Deploy da edge function (sync-nuvemshop)\n');

  console.log('Você precisa ter:');
  console.log('  • App ID do Nuvemshop');
  console.log('  • Client Secret do app');
  console.log('  • Authorization Code (gerado após instalar app na loja)\n');

  const proceed = await question('Continuar? (S/n): ');
  if (proceed.toLowerCase() === 'n') {
    console.log('\n❌ Cancelado\n');
    process.exit(0);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📋 Informações do App Nuvemshop\n');

  const clientId = await question('  Client ID: ');
  const clientSecret = await question('  Client Secret: ');

  console.log('\n💡 Como obter o Authorization Code:');
  console.log('   1. Acesse: https://www.tiendanube.com/apps/');
  console.log('   2. Clique em "Instalar" no seu app');
  console.log('   3. Depois de instalar, você será redirecionado');
  console.log('   4. A URL terá um parâmetro "code=..."');
  console.log('   5. Copie esse valor\n');

  const code = await question('  Authorization Code: ');

  if (!clientId || !clientSecret || !code) {
    console.log('\n❌ Parâmetros incompletos\n');
    process.exit(1);
  }

  console.log('\n🔐 Obtendo token...\n');

  try {
    const token = await getNuvemshopToken(clientId, clientSecret, code);

    console.log('✅ Token obtido com sucesso!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Access Token:\n');
    console.log(token);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const updateSecret = await question('Atualizar no Supabase secrets? (S/n): ');
    if (updateSecret.toLowerCase() !== 'n') {
      console.log('\n🔄 Atualizando Supabase...\n');

      try {
        // Tenta via npx (mais compatível)
        execSync(`npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN="${token}"`, {
          stdio: 'inherit',
        });

        console.log('\n✅ Secret atualizado no Supabase!\n');

        const deploy = await question('Deploy da edge function agora? (S/n): ');
        if (deploy.toLowerCase() !== 'n') {
          console.log('\n🚀 Deployando edge function...\n');
          execSync('npx supabase functions deploy sync-nuvemshop', {
            stdio: 'inherit',
          });
          console.log('\n✅ Edge function deployed!\n');
        }
      } catch (error) {
        console.error('\n⚠️  Erro ao atualizar/deploy:', error.message);
        console.log('\nAtualize manualmente com:');
        console.log(`  npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN="${token}"`);
        console.log('  npx supabase functions deploy sync-nuvemshop\n');
      }
    }

    console.log('✨ Setup concluído!\n');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log();
    process.exit(1);
  }

  rl.close();
}

function getNuvemshopToken(clientId, clientSecret, code) {
  return new Promise((resolve, reject) => {
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

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200 && response.access_token) {
            resolve(response.access_token);
          } else {
            reject(
              new Error(
                `API Error (${res.statusCode}): ${
                  response.error_description || response.error || 'Unknown error'
                }`
              )
            );
          }
        } catch (error) {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    req.write(payload);
    req.end();
  });
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error.message);
  process.exit(1);
});
