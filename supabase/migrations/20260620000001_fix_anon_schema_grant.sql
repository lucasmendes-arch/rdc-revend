-- Garante que os roles anon e authenticated têm USAGE no schema public.
-- No PostgreSQL 15+ o default mudou (public schema não é mais acessível por padrão).
-- Supabase normalmente roda esses grants no setup do projeto; no projeto novo ficou faltando.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Regranta SELECT em todas as tabelas existentes pro anon (cobre qualquer gap).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Regranta para authenticated (INSERT/UPDATE/DELETE vêm das policies específicas).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Garante que tabelas futuras criadas neste schema também herdem o grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO authenticated;
