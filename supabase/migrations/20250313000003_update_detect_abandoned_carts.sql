-- ============================================================================
-- CRM Etapa 2 — Atualizar detect_abandoned_carts() para emitir crm_events
--
-- Mudança: processo session a session via loop para poder inserir evento
-- por usuário. A versão anterior fazia UPDATE em batch.
-- Comportamento de client_sessions preservado 100%.
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_abandoned_carts()
RETURNS integer AS $$
DECLARE
  abandoned_count integer := 0;
  v_session       RECORD;
BEGIN
  -- Processa cada sessão elegível para abandono
  FOR v_session IN
    SELECT id, user_id, session_id, status
    FROM public.client_sessions
    WHERE status IN ('adicionou_carrinho', 'iniciou_checkout')
      AND updated_at < NOW() - INTERVAL '2 hours'
  LOOP
    -- Atualiza status da sessão (comportamento original preservado)
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
      -- Sem ON CONFLICT: sessões só entram aqui quando status ainda é
      -- adicionou_carrinho ou iniciou_checkout. Após o UPDATE vira abandonou,
      -- então a mesma sessão não será reprocessada em execuções futuras.
    END IF;
  END LOOP;

  IF abandoned_count > 0 THEN
    RAISE NOTICE 'Marked % sessions as abandoned and emitted CRM events', abandoned_count;
  END IF;

  RETURN abandoned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
