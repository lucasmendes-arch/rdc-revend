-- =====================================================================
-- Migration: CRM — owner (assigned_seller) e próxima ação (next_action)
-- Data: 2026-04-12
-- =====================================================================
-- Esta migration adiciona suporte a "próxima ação" por cliente e RPCs
-- admin para:
--   1) atribuir/desvincular vendedor dono (assigned_seller) de um perfil
--   2) definir/limpar a próxima ação e sua data agendada
--
-- Decisões de projeto:
-- - Nenhuma destas mudanças emite crm_events — owner e next_action
--   não devem poluir a timeline do cliente.
-- - RPCs são SECURITY DEFINER e checam is_admin() no topo.
-- - Convenção D-01: não usar subquery em profiles dentro de RLS; aqui
--   são RPCs SECURITY DEFINER, então leitura direta de profiles é OK.
-- - Retrocompatibilidade: colunas novas com DEFAULT NULL.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Colunas em profiles: next_action + next_action_at
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS next_action    text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

COMMENT ON COLUMN public.profiles.next_action IS
  'Texto livre da próxima ação planejada pelo vendedor/admin para este cliente.';
COMMENT ON COLUMN public.profiles.next_action_at IS
  'Data/hora agendada da próxima ação. NULL = sem agendamento.';


-- ---------------------------------------------------------------------
-- 2) Índices de suporte
-- ---------------------------------------------------------------------
-- Índice parcial: só perfis com próxima ação agendada (fila do CRM).
CREATE INDEX IF NOT EXISTS idx_profiles_next_action_at
  ON public.profiles (next_action_at)
  WHERE next_action_at IS NOT NULL;

-- Índice em assigned_seller para filtros por vendedor dono.
-- (assigned_seller já existe como text; criamos o índice se não existir.)
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_seller
  ON public.profiles (assigned_seller);


-- ---------------------------------------------------------------------
-- 3) RPC: admin_set_profile_seller
-- ---------------------------------------------------------------------
-- Atribui (ou desvincula, via NULL) o vendedor dono de um perfil.
-- - p_seller_id NULL      => assigned_seller = NULL
-- - p_seller_id NOT NULL  => valida sellers.id existente e active=true,
--                            grava sellers.code (text) em assigned_seller
-- Escopo restrito a role='user'. Não emite crm_events.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_seller(
  p_user_id   uuid,
  p_seller_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_code text;
  v_updated     integer;
BEGIN
  -- Checagem de permissão
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_seller_id IS NULL THEN
    -- Desvincular vendedor
    UPDATE public.profiles
       SET assigned_seller = NULL
     WHERE id = p_user_id
       AND role = 'user';
  ELSE
    -- Validar vendedor ativo e capturar o code
    SELECT s.code
      INTO v_seller_code
      FROM public.sellers s
     WHERE s.id = p_seller_id
       AND s.active = true;

    IF v_seller_code IS NULL THEN
      RAISE EXCEPTION 'Vendedor inválido ou inativo';
    END IF;

    UPDATE public.profiles
       SET assigned_seller = v_seller_code
     WHERE id = p_user_id
       AND role = 'user';
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_seller(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_profile_seller(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_set_profile_seller(uuid, uuid) IS
  'Admin: atribui (ou desvincula com NULL) o vendedor dono de um profile (role=user). Não emite crm_events.';


-- ---------------------------------------------------------------------
-- 4) RPC: admin_set_profile_next_action
-- ---------------------------------------------------------------------
-- Define (ou limpa) a próxima ação planejada para um cliente.
-- - p_next_action é normalizado: NULLIF(TRIM(...), '')
-- - p_next_action_at aceita NULL (sem agendamento)
-- Escopo restrito a role='user'. Não emite crm_events.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_next_action(
  p_user_id       uuid,
  p_next_action   text,
  p_next_action_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  text;
  v_updated integer;
BEGIN
  -- Checagem de permissão
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Normalização: string vazia vira NULL
  v_action := NULLIF(TRIM(p_next_action), '');

  UPDATE public.profiles
     SET next_action    = v_action,
         next_action_at = p_next_action_at
   WHERE id = p_user_id
     AND role = 'user';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_next_action(uuid, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_profile_next_action(uuid, text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.admin_set_profile_next_action(uuid, text, timestamptz) IS
  'Admin: define/limpa próxima ação (texto + data) de um profile (role=user). Não emite crm_events.';
