-- ============================================================================
-- Migration: 20250313000015_store_settings_and_coupons.sql
-- RDC_BACK_E6_P1_CLD_V1
-- 1. Tabela store_settings  — configurações globais da loja
-- 2. Tabela coupons         — cupons de desconto
-- 3. RPC validate_coupon    — valida cupom com regras de negócio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. store_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  id              INT          PRIMARY KEY,
  min_cart_value  NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Linha única garantida com ID fixo
INSERT INTO public.store_settings (id, min_cart_value)
VALUES (1, 500.00)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_settings_public_read" ON public.store_settings
  FOR SELECT USING (true);

CREATE POLICY "store_settings_admin_update" ON public.store_settings
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT UPDATE ON public.store_settings TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. coupons
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT          NOT NULL UNIQUE,
  discount_type   TEXT          NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_value NUMERIC(10,2),
  usage_limit     INT,
  used_count      INT           NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_uppercase CHECK (code = UPPER(code))
);

-- Índice para lookup por código (validação no checkout)
CREATE INDEX IF NOT EXISTS coupons_code_idx ON public.coupons (code);

-- RLS — anon não lista cupons; autenticado também não (evita garimpagem)
--        admin tem acesso total; RPC validate_coupon lê via SECURITY DEFINER
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupons_admin_all" ON public.coupons
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- Sem GRANT de SELECT para anon/authenticated — acesso apenas via RPC
GRANT INSERT, UPDATE, DELETE ON public.coupons TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. validate_coupon(p_code, p_cart_total)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.validate_coupon(text, numeric);

CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code       TEXT,
  p_cart_total NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
BEGIN
  -- Busca o cupom (UPPER para ser case-insensitive na entrada)
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE code = UPPER(TRIM(p_code));

  -- Cupom não encontrado
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não encontrado');
  END IF;

  -- Inativo
  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom inativo');
  END IF;

  -- Expirado
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom expirado');
  END IF;

  -- Limite de uso atingido
  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotado');
  END IF;

  -- Valor mínimo do pedido
  IF v_coupon.min_order_value IS NOT NULL AND p_cart_total < v_coupon.min_order_value THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Pedido abaixo do valor mínimo para este cupom (R$ ' ||
               to_char(v_coupon.min_order_value, 'FM999990.00') || ')'
    );
  END IF;

  -- Tudo válido
  RETURN jsonb_build_object(
    'valid',  true,
    'id',     v_coupon.id,
    'type',   v_coupon.discount_type,
    'value',  v_coupon.discount_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;
