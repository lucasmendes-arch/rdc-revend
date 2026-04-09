-- ============================================================================
-- FIX: Habilitar RLS em tabelas de sistema expostas no schema public
-- Incidente: Supabase alertou rls_disabled_in_public
-- Tabelas afetadas: rate_limits, processed_webhooks
--
-- Ambas são tabelas internas de sistema que foram criadas com RLS DISABLED.
-- No schema public do Supabase, isso expõe os dados via PostgREST API
-- para qualquer client (anon ou authenticated).
--
-- rate_limits: acessada exclusivamente pela RPC check_rate_limit()
--   que é SECURITY DEFINER (bypassa RLS).
-- processed_webhooks: acessada exclusivamente por edge functions
--   via service_role key (bypassa RLS automaticamente).
--
-- Correção: habilitar RLS sem criar policies permissivas.
-- Resultado: nenhum acesso direto via API, mantém acesso via
-- SECURITY DEFINER e service_role.
-- ============================================================================

-- 1. rate_limits — tabela de controle de rate limiting
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy necessária:
-- - check_rate_limit() é SECURITY DEFINER → bypassa RLS
-- - pg_cron cleanup roda como superuser → bypassa RLS
-- - Nenhum client acessa diretamente

-- 2. processed_webhooks — idempotência de webhooks externos
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy necessária:
-- - Edge functions usam service_role key → bypassa RLS
-- - Nenhum client acessa diretamente

-- Revogar grants desnecessários da API (belt and suspenders)
-- anon e authenticated não precisam de acesso direto a estas tabelas
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE ALL ON public.processed_webhooks FROM anon, authenticated;

-- Re-grant apenas para service_role (edge functions)
GRANT ALL ON public.rate_limits TO service_role;
GRANT ALL ON public.processed_webhooks TO service_role;
