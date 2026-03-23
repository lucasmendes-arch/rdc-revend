-- ============================================================================
-- Bloco 1 — Correção: guarda explícito na função detect_abandoned_carts
--
-- Contexto: a função já filtra status IN ('adicionou_carrinho', 'iniciou_checkout'),
-- o que por si só impede sobrescrever 'comprou'. Esta versão adiciona um guarda
-- explícito AND status <> 'comprou' como documentação de intenção e proteção
-- futura caso o filtro principal seja alterado.
--
-- A correção principal desta rodada está no frontend (useSessionTracking.ts):
-- - abandonou agora tem rank 5 (antes era 0)
-- - lógica shouldUpdateStatus impede regressão boba de abandonou → visitou
-- - permite retomada de jornada: abandonou → iniciou_checkout/adicionou_carrinho
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_abandoned_carts()
RETURNS integer AS $$
DECLARE
  abandoned_count integer := 0;
  v_session       RECORD;
BEGIN
  -- Processa cada sessão elegível para abandono.
  -- Guarda explícito: nunca sobrescrever 'comprou' (cliente já converteu).
  FOR v_session IN
    SELECT id, user_id, session_id, status
    FROM public.client_sessions
    WHERE status IN ('adicionou_carrinho', 'iniciou_checkout')
      AND status <> 'comprou'  -- guarda explícito de proteção
      AND updated_at < NOW() - INTERVAL '2 hours'
  LOOP
    -- Atualiza status da sessão
    UPDATE public.client_sessions
    SET status = 'abandonou', updated_at = NOW()
    WHERE id = v_session.id;

    abandoned_count := abandoned_count + 1;

    -- Insere evento CRM apenas se houver user_id (sessões anônimas ignoradas)
    IF v_session.user_id IS NOT NULL THEN
      INSERT INTO public.crm_events (
        user_id,
        session_id,
        event_type,
        metadata
      ) VALUES (
        v_session.user_id,
        v_session.session_id,
        'cart_abandoned',
        jsonb_build_object(
          'session_id',      v_session.session_id,
          'previous_status', v_session.status,
          'detected_at',     NOW()
        )
      );
    END IF;
  END LOOP;

  IF abandoned_count > 0 THEN
    RAISE NOTICE 'Marked % sessions as abandoned and emitted CRM events', abandoned_count;
  END IF;

  RETURN abandoned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
