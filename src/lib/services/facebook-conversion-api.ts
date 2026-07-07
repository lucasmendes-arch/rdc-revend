import { createHash, randomUUID } from 'node:crypto';

import type { ConversionEvent, TrackingResponse } from '../types/facebook-conversion';

const META_GRAPH_API_VERSION = 'v21.0';
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

interface MetaUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  country?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
}

interface MetaCustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_type?: string;
}

interface MetaEventPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
}

interface MetaApiPayload {
  data: MetaEventPayload[];
  test_event_code?: string;
}

interface MetaApiResponse {
  events_received?: number;
  fbtrace_id?: string;
  messages?: string[];
}

function resolveFacebookPixelId(): string | undefined {
  return process.env.VITE_REACT_APP_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_PIXEL_ID?.trim();
}

function removeEmptyFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => {
      if (item === undefined || item === null) return false;
      if (Array.isArray(item)) return item.length > 0;
      return true;
    })
  ) as Partial<T>;
}

/**
 * Faz a higienização base antes da normalização específica de cada campo.
 */
function normalizeBaseValue(value?: string): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalized || null;
}

function normalizeLowercaseText(value?: string): string | null {
  const normalized = normalizeBaseValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeEmail(email?: string): string | null {
  return normalizeLowercaseText(email);
}

function normalizePhone(phone?: string): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;

  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function normalizePostalCode(postalCode?: string): string | null {
  const digits = postalCode?.replace(/\D/g, '') ?? '';
  return digits || null;
}

function normalizeCountry(country?: string): string | null {
  return normalizeLowercaseText(country);
}

function hashNormalizedValue(
  value: string | undefined,
  normalizer: (input?: string) => string | null
): string[] | undefined {
  const normalized = normalizer(value);

  if (!normalized) {
    return undefined;
  }

  return [createHash('sha256').update(normalized).digest('hex')];
}

/**
 * O fbc melhora bastante a associação do lead ao clique da campanha.
 */
export function buildFbcFromFbclid(fbclid?: string): string | undefined {
  const normalized = normalizeBaseValue(fbclid);

  if (!normalized) {
    return undefined;
  }

  return `fb.1.${Date.now()}.${normalized}`;
}

/**
 * Consolida e normaliza todos os dados de usuário aceitos pela Meta.
 */
export function buildFacebookUserData(event: ConversionEvent): MetaUserData {
  const fbc = event.fbc ?? buildFbcFromFbclid(event.fbclid);

  return removeEmptyFields<MetaUserData>({
    em: hashNormalizedValue(event.email, normalizeEmail),
    ph: hashNormalizedValue(event.phone, normalizePhone),
    fn: hashNormalizedValue(event.firstName, normalizeLowercaseText),
    ln: hashNormalizedValue(event.lastName, normalizeLowercaseText),
    ct: hashNormalizedValue(event.city, normalizeLowercaseText),
    st: hashNormalizedValue(event.state, normalizeLowercaseText),
    zp: hashNormalizedValue(event.postalCode, normalizePostalCode),
    country: hashNormalizedValue(event.country, normalizeCountry),
    external_id: hashNormalizedValue(event.externalId, normalizeBaseValue),
    client_ip_address: normalizeBaseValue(event.clientIpAddress) ?? undefined,
    client_user_agent: normalizeBaseValue(event.clientUserAgent) ?? undefined,
    fbc,
    fbp: normalizeBaseValue(event.fbp) ?? undefined,
  });
}

/**
 * A validação do endpoint usa essa função para barrar eventos sem user_data.
 */
export function hasFacebookUserData(event: ConversionEvent): boolean {
  const userData = buildFacebookUserData(event);
  return Object.keys(userData).length > 0;
}

/**
 * Monta o bloco custom_data com valor, moeda e nome do conteúdo.
 */
export function buildFacebookCustomData(event: ConversionEvent): MetaCustomData | undefined {
  const customData = removeEmptyFields<MetaCustomData>({
    value: typeof event.value === 'number' ? event.value : undefined,
    currency: event.value ? event.currency ?? 'BRL' : event.currency,
    content_name: normalizeBaseValue(event.contentName) ?? undefined,
    content_type: normalizeBaseValue(event.contentType) ?? undefined,
  });

  return Object.keys(customData).length > 0 ? customData : undefined;
}

/**
 * Gera o payload final da Conversions API e valida o ambiente do servidor.
 */
export function createFacebookConversionPayload(event: ConversionEvent): {
  accessToken: string;
  pixelId: string;
  eventId: string;
  payload: MetaApiPayload;
} {
  const pixelId = resolveFacebookPixelId();
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN?.trim();

  if (!pixelId) {
    throw new Error('VITE_REACT_APP_PIXEL_ID não configurado no ambiente.');
  }

  if (!accessToken) {
    throw new Error('FACEBOOK_ACCESS_TOKEN não configurado no ambiente do servidor.');
  }

  if (!event.eventName?.trim()) {
    throw new Error('eventName é obrigatório para enviar eventos à Meta.');
  }

  if (!hasFacebookUserData(event)) {
    throw new Error('O evento precisa conter pelo menos um campo de user_data aceito pela Meta.');
  }

  const eventId = event.eventId?.trim() || randomUUID();
  const payload: MetaApiPayload = {
    data: [
      removeEmptyFields<MetaEventPayload>({
        event_name: event.eventName.trim(),
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: event.eventSourceUrl?.trim(),
        user_data: buildFacebookUserData(event),
        custom_data: buildFacebookCustomData(event),
      }) as MetaEventPayload,
    ],
  };

  const testEventCode = process.env.FACEBOOK_TEST_EVENT_CODE?.trim();
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  return {
    accessToken,
    pixelId,
    eventId,
    payload,
  };
}

/**
 * Envia o evento para a Meta via Server-Side Tracking.
 */
export async function sendFacebookConversionEvent(event: ConversionEvent): Promise<TrackingResponse> {
  const { accessToken, pixelId, eventId, payload } = createFacebookConversionPayload(event);

  try {
    const url = new URL(`${META_GRAPH_API_BASE_URL}/${pixelId}/events`);
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const data: MetaApiResponse & { error?: { message?: string } } = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error?.message || `Meta CAPI respondeu ${response.status}`);
    }

    console.log(`✅ [Meta CAPI] Evento ${event.eventName} enviado com sucesso.`, {
      eventId,
      eventsReceived: data.events_received ?? 0,
      fbTraceId: data.fbtrace_id,
    });

    return {
      success: true,
      message: 'Evento enviado com sucesso para a Meta Conversion API.',
      eventId,
    };
  } catch (error) {
    const metaErrorMessage =
      error instanceof Error ? error.message : 'Erro desconhecido ao enviar evento para a Meta.';

    console.error(`❌ [Meta CAPI] Falha ao enviar ${event.eventName}.`, {
      eventId,
      error: metaErrorMessage,
    });

    return {
      success: false,
      message: metaErrorMessage,
      eventId,
    };
  }
}

export async function trackConversionEvent(event: ConversionEvent): Promise<TrackingResponse> {
  return sendFacebookConversionEvent(event);
}
