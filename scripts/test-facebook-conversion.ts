import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { trackConversionEvent } from '../src/lib/services/facebook-conversion-api';
import type { ConversionEvent } from '../src/lib/types/facebook-conversion';

interface TestCase {
  name: string;
  event: ConversionEvent;
}

interface TestResult {
  index: number;
  name: string;
  success: boolean;
  message: string;
  eventId?: string;
}

const ROOT_DIR = process.cwd();
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const EVENT_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

async function loadEnvLocal(): Promise<void> {
  const fileContent = await readFile(ENV_LOCAL_PATH, 'utf8');
  const parsed = parseEnvFile(fileContent);

  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function validateRequiredEnv(): void {
  if (!process.env.VITE_REACT_APP_PIXEL_ID?.trim() && process.env.NEXT_PUBLIC_PIXEL_ID?.trim()) {
    process.env.VITE_REACT_APP_PIXEL_ID = process.env.NEXT_PUBLIC_PIXEL_ID;
    console.log('⚠️ VITE_REACT_APP_PIXEL_ID não encontrado em .env.local. Usando NEXT_PUBLIC_PIXEL_ID como fallback temporário.');
  }

  const requiredEnv = [
    'VITE_REACT_APP_PIXEL_ID',
    'FACEBOOK_ACCESS_TOKEN',
    'FACEBOOK_TEST_EVENT_CODE',
  ] as const;

  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Variáveis ausentes em .env.local: ${missing.join(', ')}. ` +
      'Dica: configure o Pixel ID do Vite, o Access Token da Meta e o Test Event Code antes de rodar o script.'
    );
  }
}

function buildBaseContext(suffix: string): Pick<
  ConversionEvent,
  'clientIpAddress' | 'clientUserAgent' | 'fbp' | 'fbc' | 'eventSourceUrl'
> {
  return {
    clientIpAddress: '127.0.0.1',
    clientUserAgent: `meta-conversion-local-test/1.0 (${suffix})`,
    fbp: 'fb.1.1700000000000.1234567890',
    fbc: `fb.1.1700000000000.${suffix}`,
    eventSourceUrl: `http://localhost:5173/${suffix}`,
  };
}

function buildMockEvents(): TestCase[] {
  return [
    {
      name: 'PageView',
      event: {
        eventName: 'PageView',
        contentName: 'Portal Atacado',
        ...buildBaseContext('pageview-portal-atacado'),
      },
    },
    {
      name: 'Lead',
      event: {
        eventName: 'Lead',
        email: 'vendedor@teste.com.br',
        phone: '27987654321',
        firstName: 'João',
        city: 'Vitória',
        state: 'ES',
        value: 1500,
        currency: 'BRL',
        contentName: 'Cadastro',
        ...buildBaseContext('lead-cadastro'),
      },
    },
    {
      name: 'AddToCart',
      event: {
        eventName: 'AddToCart',
        email: 'vendedor@teste.com.br',
        value: 1500,
        currency: 'BRL',
        contentName: 'Mix Atacado',
        ...buildBaseContext('addtocart-mix-atacado'),
      },
    },
    {
      name: 'Purchase',
      event: {
        eventName: 'Purchase',
        email: 'vendedor@teste.com.br',
        phone: '27987654321',
        value: 1500,
        currency: 'BRL',
        contentName: 'Mix Comprado',
        ...buildBaseContext('purchase-mix-comprado'),
      },
    },
    {
      name: 'ViewContent',
      event: {
        eventName: 'ViewContent',
        contentName: 'Página Ativador Cachos',
        ...buildBaseContext('viewcontent-ativador-cachos'),
      },
    },
  ];
}

function printFailureHint(result: TestResult): void {
  console.log('   Debug:');
  console.log(`   - Mensagem: ${result.message}`);
  console.log('   - Dica 1: confirme se FACEBOOK_TEST_EVENT_CODE está válido em Test Events.');
  console.log('   - Dica 2: confira se VITE_REACT_APP_PIXEL_ID e FACEBOOK_ACCESS_TOKEN pertencem ao mesmo pixel.');
  console.log('   - Dica 3: valide se o token tem permissão para Conversions API.');
}

function printSummary(results: TestResult[]): void {
  const failureCount = results.filter((item) => !item.success).length;

  console.log('\n📊 Relatório final');

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    console.log(
      `${icon} Evento ${result.index}/5: [${result.name}] - ${result.success ? 'ENVIADO COM SUCESSO' : 'FALHOU'}`
    );
  }

  if (failureCount === 0) {
    console.log('\n✅ Todos os 5 eventos foram testados com sucesso!');
  } else {
    console.log(`\n❌ ${failureCount} evento(s) falharam durante o teste.`);
  }
}

async function main(): Promise<void> {
  await loadEnvLocal();
  validateRequiredEnv();

  const testCases = buildMockEvents();
  const results: TestResult[] = [];

  console.log('🚀 Iniciando teste automatizado da Meta Conversion API...');
  console.log(`🧪 Test Event Code ativo: ${process.env.FACEBOOK_TEST_EVENT_CODE}`);

  for (const [index, testCase] of testCases.entries()) {
    try {
      const response = await trackConversionEvent(testCase.event);
      const result: TestResult = {
        index: index + 1,
        name: testCase.name,
        success: response.success,
        message: response.message,
        eventId: response.eventId,
      };

      results.push(result);

      if (response.success) {
        console.log(`✅ Evento ${index + 1}/5: [${testCase.name}] - ENVIADO COM SUCESSO`);
      } else {
        console.log(`❌ Erro ao enviar Evento ${index + 1}`);
        printFailureHint(result);
      }
    } catch (error) {
      const result: TestResult = {
        index: index + 1,
        name: testCase.name,
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido ao enviar evento.',
      };

      results.push(result);
      console.log(`❌ Erro ao enviar Evento ${index + 1}`);
      printFailureHint(result);
    }

    if (index < testCases.length - 1) {
      await sleep(EVENT_DELAY_MS);
    }
  }

  printSummary(results);

  if (results.some((item) => !item.success)) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error('❌ Falha ao executar o teste automatizado da Meta Conversion API.');
  console.error(error instanceof Error ? error.message : error);
  console.error('Dica: confirme se o arquivo .env.local existe na raiz e contém as 3 variáveis obrigatórias.');
  process.exitCode = 1;
});
