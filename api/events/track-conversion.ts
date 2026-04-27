import type { ConversionEvent, TrackingResponse } from '../../src/lib/types/facebook-conversion';
import {
  hasFacebookUserData,
  sendFacebookConversionEvent,
} from '../../src/lib/services/facebook-conversion-api';

interface ApiRequestLike {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
}

interface ApiResponseLike {
  status: (statusCode: number) => ApiResponseLike;
  json: (body: TrackingResponse) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

declare global {
  var __facebookConversionRateLimit: Map<string, RateLimitEntry> | undefined;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const rateLimitStore = globalThis.__facebookConversionRateLimit ?? new Map<string, RateLimitEntry>();

globalThis.__facebookConversionRateLimit = rateLimitStore;

function readHeader(headers: ApiRequestLike['headers'], name: string): string | undefined {
  const rawValue = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(rawValue)) {
    return rawValue[0];
  }

  return rawValue;
}

function readCookie(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(';').map((item) => item.trim());
  const match = cookies.find((item) => item.startsWith(`${cookieName}=`));

  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : undefined;
}

function getClientIp(request: ApiRequestLike): string | undefined {
  const forwardedFor = readHeader(request.headers, 'x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim();
  }

  return readHeader(request.headers, 'x-real-ip') ?? request.socket?.remoteAddress;
}

function cleanupRateLimitStore(now: number): void {
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Rate limiting simples em memória para impedir abuso do endpoint.
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  cleanupRateLimitStore(now);

  const entry = rateLimitStore.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function parseRequestBody(body: unknown): Record<string, unknown> {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>;
  }

  if (typeof body === 'object') {
    return body as Record<string, unknown>;
  }

  return {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function respondJson(response: ApiResponseLike, statusCode: number, body: TrackingResponse): void {
  response.status(statusCode).json(body);
}

/**
 * Endpoint server-side compatível com Vercel Functions para Meta CAPI.
 */
export default async function trackConversionHandler(request: ApiRequestLike, response: ApiResponseLike): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Allow', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204);
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    respondJson(response, 405, {
      success: false,
      message: 'Método não permitido. Use POST.',
    });
    return;
  }

  const clientIp = getClientIp(request) ?? 'unknown';

  if (isRateLimited(clientIp)) {
    respondJson(response, 429, {
      success: false,
      message: 'Limite de requisições excedido. Tente novamente em alguns segundos.',
    });
    return;
  }

  try {
    const body = parseRequestBody(request.body);
    const cookieHeader = readHeader(request.headers, 'cookie');

    const event: ConversionEvent = {
      eventName: asOptionalString(body.eventName) ?? '',
      email: asOptionalString(body.email),
      phone: asOptionalString(body.phone),
      firstName: asOptionalString(body.firstName),
      lastName: asOptionalString(body.lastName),
      city: asOptionalString(body.city),
      state: asOptionalString(body.state),
      postalCode: asOptionalString(body.postalCode),
      country: asOptionalString(body.country),
      value: asOptionalNumber(body.value),
      currency: asOptionalString(body.currency),
      contentName: asOptionalString(body.contentName),
      contentType: asOptionalString(body.contentType),
      externalId: asOptionalString(body.externalId),
      eventId: asOptionalString(body.eventId),
      eventSourceUrl: asOptionalString(body.eventSourceUrl),
      fbclid: asOptionalString(body.fbclid),
      fbc: asOptionalString(body.fbc) ?? readCookie(cookieHeader, '_fbc'),
      fbp: asOptionalString(body.fbp) ?? readCookie(cookieHeader, '_fbp'),
      clientIpAddress: clientIp === 'unknown' ? undefined : clientIp,
      clientUserAgent: readHeader(request.headers, 'user-agent'),
    };

    if (!event.eventName) {
      respondJson(response, 400, {
        success: false,
        message: 'eventName é obrigatório.',
      });
      return;
    }

    if (!hasFacebookUserData(event)) {
      respondJson(response, 400, {
        success: false,
        message: 'Envie pelo menos um campo de user_data válido para a Meta.',
      });
      return;
    }

    const result = await sendFacebookConversionEvent(event);

    respondJson(response, result.success ? 200 : 502, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao rastrear conversão.';

    console.error('❌ [Meta CAPI] Erro no endpoint /api/events/track-conversion.', {
      error: message,
    });

    respondJson(response, 500, {
      success: false,
      message,
    });
  }
}
