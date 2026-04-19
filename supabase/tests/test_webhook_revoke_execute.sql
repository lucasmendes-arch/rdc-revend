-- test_webhook_revoke_execute.sql
-- O que testa: garante que PUBLIC não tem EXECUTE nas funções de webhook de parceiro
-- Pré-condições: migration 20260418000005_partner_webhook_revoke_public_execute.sql aplicada
-- Como executar: Supabase Dashboard > SQL Editor — rodar cada bloco separadamente
-- Risco: nenhum — somente leitura de metadados do catálogo do sistema

-- ============================================================
-- BLOCO 1 — Verifica privilege de PUBLIC nas funções de webhook
-- Resultado esperado: 0 linhas (nenhuma permissão de EXECUTE para PUBLIC)
-- ============================================================
SELECT
  p.proname                        AS funcao,
  pg_get_function_arguments(p.oid) AS argumentos,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_pode_executar
FROM pg_proc p
WHERE p.proname IN (
  'build_partner_order_payload',
  'send_pending_partner_order_webhooks'
)
  AND has_function_privilege('public', p.oid, 'EXECUTE') = true;


-- ============================================================
-- BLOCO 2 — Confirma que o owner (postgres/service_role) ainda tem EXECUTE
-- Resultado esperado: 2 linhas com owner_pode_executar = true
-- ============================================================
SELECT
  p.proname                        AS funcao,
  pg_get_function_arguments(p.oid) AS argumentos,
  p.proowner::regrole::text        AS owner,
  has_function_privilege(p.proowner, p.oid, 'EXECUTE') AS owner_pode_executar
FROM pg_proc p
WHERE p.proname IN (
  'build_partner_order_payload',
  'send_pending_partner_order_webhooks'
);


-- ============================================================
-- BLOCO 3 — Inspeciona todos os grantees explícitos nas funções
-- Resultado esperado: 0 linhas (nenhum grant explícito para PUBLIC ou anon)
-- Grantees esperados apenas: owner implícito (sem linha no catalog)
-- ============================================================
SELECT
  r.routine_name                   AS funcao,
  g.grantee                        AS grantee,
  g.privilege_type                 AS privilegio,
  g.is_grantable                   AS grantavel
FROM information_schema.routine_privileges g
JOIN information_schema.routines r
  ON r.specific_name = g.specific_name
WHERE r.routine_name IN (
  'build_partner_order_payload',
  'send_pending_partner_order_webhooks'
)
  AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY r.routine_name, g.grantee;


-- ============================================================
-- BLOCO 4 — Verifica que as funções existem e têm SECURITY DEFINER
-- Resultado esperado: 2 linhas, prosecdef = true
-- ============================================================
SELECT
  proname       AS funcao,
  prosecdef     AS security_definer,
  proowner::regrole::text AS owner
FROM pg_proc
WHERE proname IN (
  'build_partner_order_payload',
  'send_pending_partner_order_webhooks'
)
ORDER BY proname;
