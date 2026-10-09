-- ============================================================================
-- Correção: salon_campaign_build_list chamava salon_render_message(text,
-- salon_clients_v) com uma linha da tabela temporária _salon_pub — mesmas
-- colunas, outro tipo, "function does not exist". Pego no teste de permissão
-- (admin gerando lista) antes de qualquer uso pela tela.
--
-- A renderização passa a receber os campos explicitamente.
-- ============================================================================

DROP FUNCTION IF EXISTS public.salon_render_message(text, public.salon_clients_v);

CREATE OR REPLACE FUNCTION public.salon_render_message(
  p_template text, p_name text, p_store text, p_days int, p_service text, p_professional text
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(coalesce(p_template, ''),
    '{primeiro_nome}', initcap(split_part(btrim(coalesce(p_name, '')), ' ', 1))),
    '{nome}', initcap(btrim(coalesce(p_name, '')))),
    '{unidade}', coalesce(p_store, '')),
    '{dias_sem_vir}', coalesce(p_days::text, '')),
    '{servico_favorito}', coalesce(p_service, 'seu cabelo')),
    '{profissional_favorita}', coalesce(p_professional, 'nossa equipe'))
$$;

-- DROP FUNCTION apaga grants (armadilha registrada no checkup de segurança):
-- devolver explicitamente só para quem precisa.
REVOKE ALL ON FUNCTION public.salon_render_message(text, text, text, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salon_render_message(text, text, text, int, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.salon_campaign_build_list(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cp        salon_campaigns%ROWTYPE;
  cfg       salon_crm_settings%ROWTYPE;
  v_total   int;
  v_nophone int;
  v_optout  int;
  v_cool    int;
  v_dup     int;
  v_in      int;
BEGIN
  SELECT * INTO cp FROM salon_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campanha nao encontrada'; END IF;
  IF cp.status NOT IN ('rascunho', 'pronta') THEN
    RAISE EXCEPTION 'a lista so pode ser refeita em campanha rascunho/pronta (status atual: %)', cp.status;
  END IF;
  SELECT * INTO cfg FROM salon_crm_settings WHERE id = 1;

  CREATE TEMP TABLE IF NOT EXISTS _salon_pub ON COMMIT DROP AS
    SELECT * FROM salon_clients_v WITH NO DATA;
  TRUNCATE _salon_pub;
  INSERT INTO _salon_pub
  SELECT * FROM salon_crm_filter((cp.filters - 'store_id' - 'include_opted_out')
                                 || jsonb_build_object('store_id', cp.store_id, 'include_opted_out', true));

  SELECT count(*) INTO v_total FROM _salon_pub;
  SELECT count(*) INTO v_nophone FROM _salon_pub WHERE whatsapp IS NULL;
  SELECT count(*) INTO v_optout FROM _salon_pub WHERE whatsapp IS NOT NULL AND opted_out;
  SELECT count(*) INTO v_cool FROM _salon_pub
   WHERE whatsapp IS NOT NULL AND NOT opted_out
     AND last_campaign_at > now() - make_interval(days => cfg.cooldown_days);

  DELETE FROM salon_campaign_recipients WHERE campaign_id = p_campaign_id;

  INSERT INTO salon_campaign_recipients (campaign_id, store_id, client_key, name, whatsapp, message)
  SELECT DISTINCT ON (p.whatsapp) p_campaign_id, p.store_id, p.client_key, p.name, p.whatsapp,
         salon_render_message(cp.message, p.name, p.store_name, p.days_since_last_visit,
                              p.favorite_service, p.favorite_professional)
    FROM _salon_pub p
   WHERE p.whatsapp IS NOT NULL AND NOT p.opted_out
     AND (p.last_campaign_at IS NULL OR p.last_campaign_at <= now() - make_interval(days => cfg.cooldown_days))
   ORDER BY p.whatsapp, p.last_visit DESC NULLS LAST;
  GET DIAGNOSTICS v_in = ROW_COUNT;

  v_dup := v_total - v_nophone - v_optout - v_cool - v_in;

  UPDATE salon_campaigns
     SET recipients_count = v_in,
         excluded = jsonb_build_object('sem_whatsapp', v_nophone, 'pediu_para_sair', v_optout,
                                       'recebeu_recentemente', v_cool, 'telefone_repetido', v_dup),
         list_built_at = now(), status = 'pronta', updated_at = now()
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object('publico', v_total, 'na_lista', v_in, 'sem_whatsapp', v_nophone,
                            'pediu_para_sair', v_optout, 'recebeu_recentemente', v_cool,
                            'telefone_repetido', v_dup);
END;
$$;
