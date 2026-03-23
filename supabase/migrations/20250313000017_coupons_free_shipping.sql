-- ============================================================================
-- Migration: 20250313000017_coupons_free_shipping.sql
-- RDC_BACK_E6_P3_CLD_V1
-- 1. Adicionar free_shipping em coupons
-- 2. Atualizar validate_coupon para retornar free_shipping no payload
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nova coluna em coupons
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. Recriar validate_coupon com free_shipping no retorno
--    Mantém: UPPER(TRIM(p_code)), mensagens de erro em PT-BR, SECURITY DEFINER
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
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE code = UPPER(TRIM(p_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não encontrado');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom inativo');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom expirado');
  END IF;

  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotado');
  END IF;

  IF v_coupon.min_order_value IS NOT NULL AND p_cart_total < v_coupon.min_order_value THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Pedido abaixo do valor mínimo para este cupom (R$ ' ||
               to_char(v_coupon.min_order_value, 'FM999990.00') || ')'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid',        true,
    'id',           v_coupon.id,
    'type',         v_coupon.discount_type,
    'value',        v_coupon.discount_value,
    'free_shipping', v_coupon.free_shipping
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;
