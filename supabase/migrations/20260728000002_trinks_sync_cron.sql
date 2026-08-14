-- ============================================================================
-- Agendamento horário do sync-trinks
--
-- Fan-out ESCALONADO: uma invocação por unidade, espaçadas 3 minutos.
--
-- Por que escalonado e não tudo de uma vez: obter sessão nova no host de
-- cookies leva 17–47s e o serviço não aguenta concorrência — 5 pedidos quase
-- simultâneos derrubaram o host para HTTP 500 (validado em 2026-07-28).
-- Com cache de sessão a maioria das execuções nem toca no host, mas quando
-- vários caches expiram juntos o escalonamento evita a estampida.
--
-- O segredo fica em internal_config e é lido em tempo de execução: o comando
-- agendado é legível em cron.job, então não pode conter o segredo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ----------------------------------------------------------------------------
-- trigger_trinks_sync(p_index)
--
-- Dispara o sync da N-ésima unidade ativa (ordem estável por cookie_route).
-- p_index é 0-based. Sem argumento, dispara todas (uso manual/backfill).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_trinks_sync(p_index int DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_unit   record;
  v_count  int := 0;
BEGIN
  SELECT value INTO v_secret FROM internal_config WHERE key = 'trinks_sync_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_trinks_sync: segredo ausente em internal_config';
    RETURN 0;
  END IF;

  FOR v_unit IN
    SELECT u.store_id, row_number() OVER (ORDER BY u.cookie_route) - 1 AS idx
    FROM trinks_units u
    WHERE u.active
  LOOP
    CONTINUE WHEN p_index IS NOT NULL AND v_unit.idx <> p_index;

    PERFORM net.http_post(
      url                  := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/sync-trinks',
      headers              := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'x-trinks-secret', v_secret
                              ),
      body                 := jsonb_build_object('store_id', v_unit.store_id),
      timeout_milliseconds := 120000
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_trinks_sync(int) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- AGENDAMENTO — aplicar À MÃO no SQL Editor, só DEPOIS de validar o parser.
--
-- Não é agendado aqui de propósito: o mapeamento das colunas dos CSVs de
-- exportação ainda não foi confirmado contra um arquivo real. Ativar antes
-- disso gravaria dado errado de hora em hora e bateria no host de cookies sem
-- necessidade. Mesmo padrão de 20250313000007_crm_dispatch_queue.sql.
--
-- Validar primeiro:
--   curl -X POST 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/sync-trinks' \
--        -H "x-trinks-secret: <internal_config.trinks_sync_secret>" \
--        -H 'Content-Type: application/json' \
--        -d '{"probe":true,"store_id":"<uuid>"}'
--
-- Confirmado o mapeamento, executar:
--
-- SELECT cron.schedule('sync-trinks-unit-0', '2 * * * *',  'SELECT trigger_trinks_sync(0)');
-- SELECT cron.schedule('sync-trinks-unit-1', '5 * * * *',  'SELECT trigger_trinks_sync(1)');
-- SELECT cron.schedule('sync-trinks-unit-2', '8 * * * *',  'SELECT trigger_trinks_sync(2)');
-- SELECT cron.schedule('sync-trinks-unit-3', '11 * * * *', 'SELECT trigger_trinks_sync(3)');
-- SELECT cron.schedule('sync-trinks-unit-4', '14 * * * *', 'SELECT trigger_trinks_sync(4)');
--
-- Os minutos são escalonados de 3 em 3 porque o host de cookies não aguenta
-- logins concorrentes (ver docs/trinks-endpoints.md).
-- ----------------------------------------------------------------------------
