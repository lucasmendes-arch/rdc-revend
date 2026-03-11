-- ============================================================================
-- Migration: 20250313000014_cleanup_sessions_and_users.sql
-- RDC_BACK_E5_P10_CLD_V1
-- 1. Deletar sessões anônimas (sem user_id ou sem perfil correspondente)
-- 2. Reverter status da Jussara para 'visitou' (pedido de teste deletado)
-- 3. Deduplicar sessões de Taita Bispo (manter a mais recente)
-- 4. Adicionar UNIQUE constraint em client_sessions.user_id
-- 5. Deletar usuário rebeca@gmail.com
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Deletar sessões anônimas
-- ----------------------------------------------------------------------------
DELETE FROM client_sessions
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM public.profiles);

-- ----------------------------------------------------------------------------
-- 2. Reverter Jussara para 'visitou'
-- ----------------------------------------------------------------------------
UPDATE client_sessions
SET    status     = 'visitou',
       updated_at = now()
WHERE  user_id IN (
  SELECT id FROM public.profiles
  WHERE full_name ILIKE '%jussara%'
);

-- ----------------------------------------------------------------------------
-- 3. Deduplicar TODOS os user_ids — manter sessão mais recente por usuário
--    (Taita Bispo e qualquer outro com duplicata)
-- ----------------------------------------------------------------------------
DELETE FROM client_sessions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id
             ORDER BY updated_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM client_sessions
    WHERE user_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ----------------------------------------------------------------------------
-- 4. UNIQUE constraint em user_id (previne duplicatas futuras)
--    Usamos IF NOT EXISTS via DO block para ser idempotente
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_sessions_user_id_unique'
  ) THEN
    ALTER TABLE public.client_sessions
      ADD CONSTRAINT client_sessions_user_id_unique UNIQUE (user_id);
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. Deletar Rebeca — primeiro remover registros filhos, depois o usuário
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rebeca_id uuid;
BEGIN
  SELECT id INTO v_rebeca_id FROM auth.users WHERE email = 'rebeca@gmail.com';

  IF v_rebeca_id IS NOT NULL THEN
    DELETE FROM public.client_sessions WHERE user_id = v_rebeca_id;
    DELETE FROM public.profiles         WHERE id      = v_rebeca_id;
    DELETE FROM auth.users              WHERE id      = v_rebeca_id;
  END IF;
END
$$;
