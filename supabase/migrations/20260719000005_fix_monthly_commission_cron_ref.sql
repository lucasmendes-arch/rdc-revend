-- Fix: cron.schedule de 'monthly-commission-reports' (criado em
-- 20260508000002_monthly_commission_cron.sql) apontava pro project ref antigo
-- (kjfsmwtwbreapipifjtu), de antes do projeto ser recriado em 2026-06-20.
-- Além disso pg_cron não estava habilitado nesse remoto até 20260719000002 —
-- o job nunca chegou a existir de fato em cron.job. cron.schedule com o mesmo
-- nome atualiza o job in-place (cria se não existir).
--
-- Nota: só o project ref foi corrigido aqui, por pedido explícito — a edge
-- function cron-commission-reports continua sem deploy, sem verify_jwt=false
-- no config.toml, e o bucket de Storage 'commission-reports' não existe.
-- O cron passa a disparar certinho todo dia 1, mas ainda sem efeito real até
-- esses 3 pontos serem resolvidos.

SELECT cron.schedule(
  'monthly-commission-reports',
  '0 11 1 * *',
  $$
  SELECT net.http_post(
    url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/cron-commission-reports',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
