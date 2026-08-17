-- Expurgo automático de candidatos arquivados há mais de 45 dias.
--
-- Fecha o ciclo de vida do card no funil de RH, que hoje já é automático até a
-- penúltima etapa:
--   descartado --(automação "Altera Data fim para d+1")--> arquivado
--   arquivado  --(este cron, 45 dias)-----------------------> apagado da base
--
-- "Arquivado há 45 dias" é medido por candidates.stage_started_at, o mesmo
-- carimbo que o kanban usa pra mostrar tempo em etapa: ele é reescrito pelo
-- trigger sempre que a etapa muda de fato, então desarquivar e arquivar de
-- novo reinicia a contagem — que é o comportamento esperado.
--
-- A remoção é física (DELETE), não um soft delete: o pedido é tirar o
-- candidato da base. As tabelas dependentes já estão com ON DELETE CASCADE
-- (candidate_stage_history, candidate_answers, candidate_tags,
-- automation_whatsapp_queue) e somem junto. whatsapp_messages é
-- ON DELETE SET NULL de propósito — a conversa recebida continua existindo
-- sem vínculo, porque ela é indexada pelo telefone e não pertence ao card.
--
-- Arquivos no R2 (photo_url/resume_url) NÃO são apagados aqui: o banco não
-- tem credencial do bucket. Ficam órfãos até uma limpeza separada.

-- ============================================================
-- 1. Log de execução — observabilidade sem guardar PII.
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_purge_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  deleted_count integer NOT NULL,
  cutoff_days   integer NOT NULL
);

COMMENT ON TABLE candidate_purge_runs IS
  'Uma linha por execução de purge_archived_candidates(). Só contagem — nome, telefone e currículo do candidato apagado não são preservados aqui, senão o expurgo não expurgaria nada.';

ALTER TABLE candidate_purge_runs ENABLE ROW LEVEL SECURITY;

-- Leitura pra auditoria; escrita só pela função SECURITY DEFINER abaixo,
-- mesmo padrão de automation_process_runs.
CREATE POLICY candidate_purge_runs_rh_read ON candidate_purge_runs
  FOR SELECT TO authenticated USING (has_rh_access());

GRANT SELECT ON candidate_purge_runs TO authenticated;

-- ============================================================
-- 2. A função de expurgo.
-- ============================================================

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
    WHERE c.stage = 'arquivado'
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
  'Apaga candidatos em stage=arquivado há mais de p_days dias (padrão 45), pulando quem tem processo no DP. Rodada diária pelo cron purge-archived-candidates.';

-- Só o cron (postgres) executa. Nenhum grant pra authenticated: apagar
-- candidato em lote não é ação de tela.
REVOKE EXECUTE ON FUNCTION purge_archived_candidates(integer) FROM PUBLIC;

-- ============================================================
-- 3. Cron — diário, de madrugada.
-- ============================================================
-- 03:30 UTC = 00:30 no horário de Brasília, fora de qualquer janela de uso do
-- kanban. Cadência diária basta: a régua é de 45 dias, não há ganho em olhar
-- de hora em hora.

SELECT cron.unschedule('purge-archived-candidates')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-archived-candidates');

SELECT cron.schedule('purge-archived-candidates', '30 3 * * *',
  $$SELECT purge_archived_candidates()$$);
