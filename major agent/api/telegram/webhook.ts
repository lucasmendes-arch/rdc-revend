// ============================================================
// BaseOp — Vercel Edge Function: Telegram Webhook Receiver
// POST /api/telegram/webhook
//
// Responsabilidades:
// 1. Validar token do Telegram via header
// 2. Parsear mensagem e extrair comando + payload
// 3. Rate limit: 30 msgs/min por chat_id
// 4. Deduplicação por telegram_message_id
// 5. Encaminhar para n8n via HTTP
// 6. Retornar 200 sempre (Telegram não deve reenviar)
// ============================================================

export const config = { runtime: 'edge' };

// Rate limit em memória (reset automático por cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Dedup em memória (guarda últimos N message_ids)
const recentMessageIds = new Set<string>();
const DEDUP_MAX_SIZE = 500;

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface ParsedCommand {
  command: string | null;
  payload: string;
}

function parseCommand(text: string): ParsedCommand {
  const match = text.match(/^\/(\w+)\s*([\s\S]*)/);
  if (match) {
    return { command: match[1], payload: match[2].trim() };
  }
  return { command: null, payload: text.trim() };
}

function checkRateLimit(chatId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(chatId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(chatId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function isDuplicate(messageId: string): boolean {
  if (recentMessageIds.has(messageId)) return true;

  recentMessageIds.add(messageId);

  // Limpar set se ficar muito grande
  if (recentMessageIds.size > DEDUP_MAX_SIZE) {
    const entries = Array.from(recentMessageIds);
    const toRemove = entries.slice(0, entries.length - DEDUP_MAX_SIZE / 2);
    for (const id of toRemove) recentMessageIds.delete(id);
  }

  return false;
}

async function sendTelegramReply(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Falha silenciosa — não bloquear o fluxo
  }
}

export default async function handler(req: Request): Promise<Response> {
  // Apenas POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // 1. Validar secret do Telegram
  const telegramSecret = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || telegramSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parsear body
  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response('OK', { status: 200 });
  }

  const message = update.message;
  if (!message?.text) {
    // Ignorar updates sem texto (stickers, fotos, etc)
    return new Response('OK', { status: 200 });
  }

  const chatId = String(message.chat.id);
  const messageId = String(message.message_id);

  // 3. Deduplicação
  if (isDuplicate(`${chatId}:${messageId}`)) {
    return new Response('OK', { status: 200 });
  }

  // 4. Rate limit
  if (!checkRateLimit(chatId)) {
    await sendTelegramReply(
      message.chat.id,
      '⏳ Muitas mensagens seguidas. Aguarde um momento.'
    );
    return new Response('OK', { status: 200 });
  }

  // 5. Parsear comando
  const { command, payload } = parseCommand(message.text);

  // 6. Montar payload para n8n
  const n8nPayload = {
    telegram_message_id: messageId,
    chat_id: chatId,
    user_id: message.from?.id,
    username: message.from?.username ?? null,
    first_name: message.from?.first_name ?? null,
    command,
    payload,
    raw_text: message.text,
    timestamp: message.date,
  };

  // 7. Encaminhar para n8n
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  const n8nSecret = process.env.N8N_WEBHOOK_SECRET;

  if (n8nUrl) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (n8nSecret) {
        headers['X-N8N-Secret'] = n8nSecret;
      }

      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(n8nPayload),
      });

      if (!response.ok) {
        console.error(`n8n respondeu ${response.status}: ${await response.text()}`);
      }
    } catch (err) {
      console.error('Erro ao encaminhar para n8n:', err);
      // Não falhar — retornar 200 para o Telegram de qualquer forma
    }
  } else {
    console.warn('N8N_WEBHOOK_URL não configurada');
  }

  // 8. Sempre retornar 200
  return new Response('OK', { status: 200 });
}
