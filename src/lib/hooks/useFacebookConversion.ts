import { useCallback } from 'react';

import type { ConversionEvent, TrackingResponse } from '../types/facebook-conversion';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const FACEBOOK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function buildFbcFromFbclid(fbclid?: string): string | undefined {
  const normalized = fbclid?.trim();

  if (!normalized) {
    return undefined;
  }

  return `fb.1.${Date.now()}.${normalized}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const cookies = document.cookie.split(';').map((item) => item.trim());
  const match = cookies.find((item) => item.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/**
 * Persiste cookies de atribuição do Meta Ads entre páginas.
 */
function writeCookie(name: string, value: string, maxAgeSeconds = FACEBOOK_COOKIE_MAX_AGE_SECONDS): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAgeSeconds}`,
    'SameSite=Lax',
    window.location.protocol === 'https:' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function readFbclidFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('fbclid') ?? undefined;
  } catch {
    return undefined;
  }
}

function createEventId(eventName: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${eventName}_${crypto.randomUUID()}`;
  }

  return `${eventName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function removeEmptyFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined && item !== null && item !== '')
  ) as Partial<T>;
}

function buildPixelPayload(event: ConversionEvent): Record<string, unknown> {
  return removeEmptyFields({
    content_name: event.contentName,
    content_type: event.contentType,
    value: event.value,
    currency: event.currency ?? (typeof event.value === 'number' ? 'BRL' : undefined),
  });
}

async function postConversion(payload: ConversionEvent): Promise<TrackingResponse> {
  const response = await fetch('/api/events/track-conversion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  let body: TrackingResponse | null = null;

  try {
    body = (await response.json()) as TrackingResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body?.success) {
    throw new Error(body?.message ?? `Falha no endpoint /api/events/track-conversion (${response.status}).`);
  }

  return body;
}

/**
 * Captura e persiste fbclid/fbc/fbp no cliente para aumentar a match quality.
 */
export function captureFacebookBrowserIdentifiers(currentUrl = typeof window !== 'undefined' ? window.location.href : ''): Pick<
  ConversionEvent,
  'fbclid' | 'fbc' | 'fbp'
> {
  if (typeof window === 'undefined') {
    return {};
  }

  const fbclid = readFbclidFromUrl(currentUrl);
  const existingFbc = readCookie('_fbc');
  const existingFbp = readCookie('_fbp');
  const fbc = fbclid ? buildFbcFromFbclid(fbclid) : existingFbc;

  if (fbclid && fbc) {
    writeCookie('_fbc', fbc);
  }

  return removeEmptyFields({
    fbclid,
    fbc,
    fbp: existingFbp,
  });
}

/**
 * Dispara o evento no Pixel e no endpoint server-side sem bloquear a UX.
 */
export function useTrackConversion(): (eventData: ConversionEvent) => string | undefined {
  return useCallback((eventData: ConversionEvent) => {
    if (!eventData.eventName?.trim()) {
      console.error('❌ [Meta CAPI] eventName é obrigatório para rastreamento.');
      return undefined;
    }

    const eventId = eventData.eventId?.trim() || createEventId(eventData.eventName.trim());
    const browserIdentifiers = captureFacebookBrowserIdentifiers();

    const payload: ConversionEvent = {
      ...eventData,
      eventId,
      currency: eventData.currency ?? (typeof eventData.value === 'number' ? 'BRL' : undefined),
      eventSourceUrl: eventData.eventSourceUrl ?? window.location.href,
      clientUserAgent: eventData.clientUserAgent ?? navigator.userAgent,
      fbclid: eventData.fbclid ?? browserIdentifiers.fbclid,
      fbc: eventData.fbc ?? browserIdentifiers.fbc,
      fbp: eventData.fbp ?? browserIdentifiers.fbp,
    };

    if (window.fbq) {
      window.fbq('track', payload.eventName, buildPixelPayload(payload), { eventID: eventId });
    }

    void postConversion(payload)
      .then((response) => {
        console.log(`✅ [Meta CAPI] Evento ${payload.eventName} confirmado pelo endpoint.`, {
          eventId: response.eventId ?? eventId,
        });
      })
      .catch((error: unknown) => {
        console.error(`❌ [Meta CAPI] Falha ao rastrear ${payload.eventName}.`, error);
      });

    return eventId;
  }, []);
}
