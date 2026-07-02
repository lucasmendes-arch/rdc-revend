-- Fix: service_role nunca recebeu os grants padrão que o Supabase provisiona
-- automaticamente em projetos novos (mesma causa raiz de 20260620000001 e
-- 20260620000002, que corrigiram anon/authenticated mas esqueceram service_role).
--
-- service_role bypassa RLS, mas GRANT de schema/tabela/função é checado
-- ANTES e independente do RLS. Sem USAGE ON SCHEMA public, toda chamada
-- .from()/.rpc() feita por edge functions via PostgREST falha com
-- "permission denied for schema public" (42501) — mesmo usando a service key.
--
-- Sintoma confirmado: create-user retornando 403 porque a query
-- profiles.select('role') falhava silenciosamente (erro não checado no
-- código da edge function) e o profile ficava undefined.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
