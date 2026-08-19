-- Tira o EXECUTE de purge_archived_candidates do service_role.
--
-- A migration anterior fez `REVOKE ... FROM PUBLIC` achando que isso deixava
-- só o dono (postgres, que é quem o cron usa). Não deixa: o projeto tem
-- default privileges que dão EXECUTE em função nova pro service_role, e o
-- REVOKE de PUBLIC não toca em grant nominal. Conferido depois de aplicar:
--   proacl = {postgres=X/postgres,service_role=X/postgres}
--
-- Na prática significava que qualquer edge function (ou qualquer um com a
-- service key) podia disparar um DELETE em lote de candidatos via RPC. Nada
-- precisa disso hoje — o único chamador é o cron, que roda como postgres e
-- não depende de grant nenhum. Se algum dia existir um botão "expurgar
-- agora", o GRANT volta de forma explícita e deliberada.
--
-- Sem DROP FUNCTION de propósito: DROP apaga os grants e o CREATE seguinte
-- devolve EXECUTE pro PUBLIC/anon (ver o vazamento do get_system_users no
-- checkup de 2026-07-23).

REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM authenticated;
