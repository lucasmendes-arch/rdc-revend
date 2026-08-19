-- Corrige a etapa observada pelo expurgo: 'concluido_arquivado', não 'arquivado'.
--
-- O CHECK de candidates.stage não tem 'arquivado' — a etapa chamada de
-- "Arquivado" na UI e nas automações é 'concluido_arquivado'. A versão
-- aplicada em 20260817000001 filtrava por 'arquivado', que não casa com
-- linha nenhuma: o cron rodaria todo dia apagando zero candidato, sem erro
-- nenhum pra denunciar o problema. Confirmado na automação que alimenta a
-- etapa ("Quando chega data fim - Altera Status Descartado > Arquivado",
-- action_config = {"stage": "concluido_arquivado"}).
--
-- Resto da função é idêntico ao de 20260817000001 — só o literal muda.

CREATE OR REPLACE FUNCTION purge_archived_candidates(p_days integer DEFAULT 45)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT c.id
    FROM candidates c
    WHERE c.stage = 'concluido_arquivado'
      AND c.stage_started_at < now() - make_interval(days => p_days)
      -- employee_processes.candidate_id é ON DELETE RESTRICT: um candidato
      -- com processo de DP faria o DELETE estourar e derrubar a execução
      -- inteira. Pular explicitamente troca a falha por um registro que
      -- simplesmente sobrevive ao expurgo — o vínculo com o DP é motivo de
      -- retenção, não um caso a forçar.
      AND NOT EXISTS (
        SELECT 1 FROM employee_processes ep WHERE ep.candidate_id = c.id
      )
    FOR UPDATE SKIP LOCKED
  ), del AS (
    DELETE FROM candidates WHERE id IN (SELECT id FROM doomed)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  INSERT INTO candidate_purge_runs (deleted_count, cutoff_days)
  VALUES (v_deleted, p_days);

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION purge_archived_candidates(integer) IS
  'Apaga candidatos em stage=concluido_arquivado há mais de p_days dias (padrão 45), pulando quem tem processo no DP. Rodada diária pelo cron purge-archived-candidates.';

-- CREATE OR REPLACE preserva o ACL, então o REVOKE de 20260817000002
-- continua valendo (só postgres executa). Reafirmado aqui como cinto e
-- suspensório — se um dia alguém trocar isto por DROP + CREATE, o grant
-- volta pro PUBLIC sem avisar.
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM authenticated;
