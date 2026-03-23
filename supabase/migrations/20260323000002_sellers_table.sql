-- ============================================================================
-- Migration: 20260323000002_sellers_table.sql
-- BLOCO 2 — Fase 1: tabela de vendedores
--
-- Implementa:
--   1. Tabela `sellers` com todos os campos necessários
--   2. Trigger updated_at (padrão do projeto: função dedicada por tabela)
--   3. Trigger de single-default atômico (INSERT OR UPDATE OF is_default)
--   4. UNIQUE INDEX parcial em is_default = true (proteção adicional de integridade)
--   5. RLS: somente admin tem acesso (padrão is_admin())
-- ============================================================================


-- ============================================================================
-- 1. TABELA sellers
-- ============================================================================

CREATE TABLE public.sellers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  code           text        UNIQUE,                 -- apelido/código interno (ex: "REBECA")
  email          text,
  phone          text,
  commission_pct numeric(5,2) NOT NULL DEFAULT 0
                 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  is_default     boolean     NOT NULL DEFAULT false, -- vendedora padrão para pedidos sem seller_id explícito
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.sellers                IS 'Cadastro de vendedores/representantes comerciais';
COMMENT ON COLUMN public.sellers.code           IS 'Código interno / apelido único (ex: REBECA, MARIA)';
COMMENT ON COLUMN public.sellers.commission_pct IS 'Comissão em % sobre o total do pedido (0–100)';
COMMENT ON COLUMN public.sellers.is_default     IS 'Exatamente uma seller pode ser padrão. Gerenciado via trigger.';


-- ============================================================================
-- 2. TRIGGER: atualizar updated_at em cada UPDATE
--    Segue o padrão do projeto (função dedicada por tabela).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_sellers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sellers_updated_at
  BEFORE UPDATE ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.update_sellers_updated_at();


-- ============================================================================
-- 3. TRIGGER: garantir no máximo uma seller com is_default = true
--
-- Cobre dois cenários:
--   a) INSERT com is_default = true  → trigger limpa outras antes de inserir
--   b) UPDATE OF is_default = true   → trigger limpa outras antes de atualizar
--
-- A cláusula "OF is_default" no UPDATE faz o trigger disparar apenas quando
-- is_default está explicitamente na cláusula SET, evitando execução desnecessária.
-- Para INSERT, o trigger sempre dispara, mas só age quando NEW.is_default = true.
--
-- Compatibilidade com o UNIQUE INDEX parcial (item 4):
--   - Em operação normal: o trigger limpa primeiro → o índice nunca vê conflito.
--   - Em race condition (duas transações concurrent): o índice serializa e uma
--     das transações falha com erro de unique_violation, protegendo a integridade.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sellers_enforce_single_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.sellers
    SET    is_default = false
    WHERE  id <> NEW.id
      AND  is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE para que o UPDATE acima aconteça antes da nova linha ser gravada,
-- garantindo que a troca seja atômica dentro da mesma transação.
CREATE TRIGGER trg_sellers_enforce_single_default
  BEFORE INSERT OR UPDATE OF is_default ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.sellers_enforce_single_default();


-- ============================================================================
-- 4. UNIQUE INDEX PARCIAL em is_default = true
--
-- Proteção de integridade complementar ao trigger.
-- Previne duplicidade em situações que o trigger não pode cobrir sozinho:
--   - Race condition entre transações concorrentes
--   - INSERT/UPDATE direto no banco (ex: migrations, scripts de manutenção)
--     que executem com SET session_replication_role = replica (bypass trigger)
-- ============================================================================

CREATE UNIQUE INDEX sellers_single_default_idx
  ON public.sellers (is_default)
  WHERE is_default = true;


-- ============================================================================
-- 5. RLS — somente admins têm acesso
--    Padrão do projeto: is_admin() sem subquery recursiva.
--    Futuro: quando existir role 'seller', adicionar policy de leitura própria.
-- ============================================================================

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sellers_admin_all"
  ON public.sellers
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
