export interface StoreSettings {
  id: number;
  min_cart_value: number;
  updated_at?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'fixed' | 'percent' | 'free_shipping' | 'shipping_percent';
  discount_value: number;
  usage_limit: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ValidateCouponResponse {
  valid: boolean;
  discount_amount: number;
  coupon_id?: string;
  error?: string;
}
