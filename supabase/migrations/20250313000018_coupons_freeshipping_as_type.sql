-- ============================================================================
-- Migration: 20250313000018_coupons_freeshipping_as_type.sql
-- RDC_BACK_E6_P4_CLD_V1
-- 1. Remover coluna booleana free_shipping (adicionada em _017)
-- 2. Expandir CHECK de discount_type para incluir 'free_shipping'
-- 3. Recriar validate_coupon — retorno limpo: valid, id, type, value
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remover coluna booleana free_shipping
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons DROP COLUMN IF EXISTS free_shipping;

-- ----------------------------------------------------------------------------
-- 2. Atualizar CHECK constraint de discount_type
--    Precisa recriar a constraint pois PostgreSQL não suporta ALTER CHECK
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_discount_type_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_discount_type_check
  CHECK (discount_type IN ('percent', 'fixed', 'free_shipping'));

-- ----------------------------------------------------------------------------
-- 3. Recriar validate_coupon sem free_shipping, retorno: valid, id, type, value
--    Mantém: UPPER(TRIM()), mensagens PT-BR, SECURITY DEFINER
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
    'valid', true,
    'id',    v_coupon.id,
    'type',  v_coupon.discount_type,
    'value', v_coupon.discount_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;
