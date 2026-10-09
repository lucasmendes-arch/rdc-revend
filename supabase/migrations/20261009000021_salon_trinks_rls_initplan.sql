-- Lista de clientes do CRM não carregava em produção: salon_crm_search estourava
-- o statement_timeout de 8s do role authenticated.
--
-- Causa: salon_clients_v é security_invoker e tem subqueries correlacionadas
-- por cliente (trinks_daily_revenue, trinks_appointments, salon_opt_outs,
-- salon_campaign_recipients). Com a policy escrita como `is_admin()`, o Postgres
-- reavalia a função em cada linha de cada subquery — dezenas de milhares de
-- consultas a profiles por chamada. A agenda (20261009000020) acrescentou as
-- laterais em trinks_appointments e passou do limite.
--
-- Correção: `(select public.is_admin())` vira InitPlan, avaliado uma vez por
-- query. Mesma semântica de acesso (só admin), só muda o custo.
-- Ver https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (tablename LIKE 'salon\_%' OR tablename LIKE 'trinks\_%')
       AND (qual = 'is_admin()' OR with_check = 'is_admin()')
  LOOP
    IF p.qual = 'is_admin()' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING ((SELECT public.is_admin()))',
                     p.policyname, p.schemaname, p.tablename);
    END IF;
    IF p.with_check = 'is_admin()' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK ((SELECT public.is_admin()))',
                     p.policyname, p.schemaname, p.tablename);
    END IF;
  END LOOP;
END $$;
