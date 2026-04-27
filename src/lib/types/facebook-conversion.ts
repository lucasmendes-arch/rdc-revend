export interface ConversionEvent {
  eventName: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  value?: number;
  currency?: string;
  contentName?: string;
  contentType?: string;
  externalId?: string;
  eventId?: string;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  clientIpAddress?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
}

export interface TrackingResponse {
  success: boolean;
  message: string;
  eventId?: string;
}
