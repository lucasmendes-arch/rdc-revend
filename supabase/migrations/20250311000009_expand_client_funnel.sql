-- Expand client_sessions status to support full funnel
ALTER TABLE public.client_sessions DROP CONSTRAINT IF EXISTS client_sessions_status_check;
ALTER TABLE public.client_sessions ADD CONSTRAINT client_sessions_status_check
  CHECK (status IN ('visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout', 'comprou', 'abandonou'));
