-- =============================================================================
-- Migration: customer_notes
-- -----------------------------------------------------------------------------
-- Cria a tabela public.customer_notes para armazenar anotacoes internas
-- (admin-only) associadas a um cliente (auth.users). Inclui:
--   - tabela + indices + comentarios
--   - trigger de updated_at (funcao dedicada, padrao do projeto)
--   - RLS admin-only usando public.is_admin() (regra D-01: NUNCA subquery em
--     profiles dentro de policies)
--   - RPCs admin_list/create/update/delete_customer_note
--
-- Todas as RPCs sao SECURITY DEFINER com checagem explicita is_admin() no topo,
-- REVOKE PUBLIC + GRANT authenticated, e SET search_path = public.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabela public.customer_notes
-- -----------------------------------------------------------------------------
CREATE TABLE public.customer_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text        NOT NULL CHECK (length(trim(content)) > 0),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indices de suporte: listagem por cliente e ordenacao por data
CREATE INDEX idx_customer_notes_customer_id ON public.customer_notes (customer_id);
CREATE INDEX idx_customer_notes_created_at  ON public.customer_notes (created_at DESC);

-- Comentarios descritivos
COMMENT ON TABLE  public.customer_notes              IS 'Anotacoes internas (admin-only) associadas a um cliente. Usadas pelo CRM para registrar observacoes, historico comercial e follow-ups.';
COMMENT ON COLUMN public.customer_notes.id           IS 'Identificador unico da nota.';
COMMENT ON COLUMN public.customer_notes.customer_id  IS 'Cliente (auth.users.id) ao qual a nota pertence. ON DELETE CASCADE: apagar o cliente remove as notas.';
COMMENT ON COLUMN public.customer_notes.content      IS 'Texto da nota. Nao pode ser vazio nem apenas espacos (CHECK length(trim) > 0).';
COMMENT ON COLUMN public.customer_notes.created_by   IS 'Admin (auth.users.id) que criou a nota. ON DELETE SET NULL para preservar historico.';
COMMENT ON COLUMN public.customer_notes.created_at   IS 'Data/hora de criacao (default now()).';
COMMENT ON COLUMN public.customer_notes.updated_at   IS 'Data/hora da ultima atualizacao, mantida por trigger.';


-- -----------------------------------------------------------------------------
-- 2. Trigger de updated_at (funcao dedicada por tabela, padrao do projeto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_notes_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_notes_updated_at();


-- -----------------------------------------------------------------------------
-- 3. RLS — admin-only (regra D-01: apenas public.is_admin())
-- -----------------------------------------------------------------------------
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_notes_admin_all"
  ON public.customer_notes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- -----------------------------------------------------------------------------
-- 4. RPC admin_list_customer_notes(p_customer_id uuid)
-- -----------------------------------------------------------------------------
-- Lista as notas de um cliente, enriquecidas com o nome do autor
-- (profiles.full_name via LEFT JOIN), ordenadas por created_at DESC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_customer_notes(p_customer_id uuid)
RETURNS TABLE (
  id              uuid,
  customer_id     uuid,
  content         text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    cn.id,
    cn.customer_id,
    cn.content,
    cn.created_by,
    p.full_name AS created_by_name,
    cn.created_at,
    cn.updated_at
  FROM public.customer_notes cn
  LEFT JOIN public.profiles p ON p.id = cn.created_by
  WHERE cn.customer_id = p_customer_id
  ORDER BY cn.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_customer_notes(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_customer_notes(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 5. RPC admin_create_customer_note(p_customer_id uuid, p_content text)
-- -----------------------------------------------------------------------------
-- Insere uma nota para o cliente indicado, associando created_by = auth.uid().
-- Normaliza content via TRIM e valida NOT EMPTY.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_customer_note(
  p_customer_id uuid,
  p_content     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_content := TRIM(COALESCE(p_content, ''));

  IF v_content = '' THEN
    RAISE EXCEPTION 'Conteudo da nota nao pode ser vazio';
  END IF;

  INSERT INTO public.customer_notes (customer_id, content, created_by)
  VALUES (p_customer_id, v_content, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_customer_note(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_create_customer_note(uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 6. RPC admin_update_customer_note(p_note_id uuid, p_content text)
-- -----------------------------------------------------------------------------
-- Atualiza o conteudo de uma nota existente. Valida NOT EMPTY e levanta
-- excecao 'Nota nao encontrada' caso o id nao exista.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_customer_note(
  p_note_id uuid,
  p_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
  v_rows    integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_content := TRIM(COALESCE(p_content, ''));

  IF v_content = '' THEN
    RAISE EXCEPTION 'Conteudo da nota nao pode ser vazio';
  END IF;

  UPDATE public.customer_notes
     SET content = v_content
   WHERE id = p_note_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Nota nao encontrada';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_customer_note(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_customer_note(uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 7. RPC admin_delete_customer_note(p_note_id uuid)
-- -----------------------------------------------------------------------------
-- Remove uma nota pelo id. Levanta 'Nota nao encontrada' se nao existir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_customer_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  DELETE FROM public.customer_notes
   WHERE id = p_note_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Nota nao encontrada';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_customer_note(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_customer_note(uuid) TO authenticated;
