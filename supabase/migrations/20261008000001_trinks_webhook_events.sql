-- ============================================================================
-- Caixa de entrada dos webhooks do Trinks
--
-- O Trinks entrega eventos (fechamento de conta, estorno, cliente, profissional,
-- estabelecimento, agendamento) via Amazon SNS para o workflow n8n
-- "WebHook Trinks", que repassa o envelope SNS bruto para a edge function
-- `trinks-webhook`. A função valida a assinatura da AWS e grava aqui.
--
-- Esta tabela é a camada 1 (bruta e imutável): um registro por mensagem SNS,
-- exatamente como chegou. As camadas organizadas e os resumos diários do
-- dashboard são derivados dela e podem ser reprocessados a qualquer momento.
--
-- Contém dados pessoais de clientes (CPF, e-mail, telefone, endereço). A
-- guarda é intencional: consentimento LGPD colhido pela rede (portal, caixa e
-- WhatsApp). Escrita só pela service_role; leitura só por admin.
--
-- Tipos de evento (TipoDeEvento): 1 Fechamento de Conta, 2 Estorno,
-- 3 Inclusão de Cliente, 4 Alteração de Cliente, 5/6/7 Profissional
-- (inclusão/alteração/inativação), 8/9/10 Estabelecimento, 11/12/13
-- Agendamento (inclusão/alteração/exclusão). Action: 1 inclusão,
-- 2 alteração, 3 exclusão, 9 estorno. Ver docs/trinks-endpoints.md.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trinks_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Envelope SNS
  message_id        text NOT NULL,
  sns_type          text NOT NULL,          -- Notification | SubscriptionConfirmation | UnsubscribeConfirmation
  topic_arn         text,
  sns_timestamp     timestamptz,

  -- Campos extraídos da Message, para filtrar sem abrir o JSON
  event_type        int,                    -- TipoDeEvento
  action            int,                    -- Action
  establishment_id  bigint,                 -- IdDoEstabelecimento
  store_id          uuid REFERENCES public.stores(id) ON DELETE SET NULL,

  payload           jsonb,                  -- Message já parseada (null se não for JSON)
  envelope          jsonb NOT NULL,         -- envelope SNS completo, como recebido

  received_at       timestamptz NOT NULL DEFAULT now(),

  -- Preenchidos pela camada de processamento (passo 3)
  processed_at      timestamptz,
  process_error     text,

  CONSTRAINT trinks_webhook_events_message_unique UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_trinks_webhook_events_received
  ON public.trinks_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_trinks_webhook_events_type
  ON public.trinks_webhook_events (event_type, establishment_id, received_at DESC);

-- Fila do processamento: só o que ainda não foi tratado.
CREATE INDEX IF NOT EXISTS idx_trinks_webhook_events_pending
  ON public.trinks_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.trinks_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_webhook_events" ON public.trinks_webhook_events
  FOR SELECT USING (public.is_admin());

-- Projeto nasceu sem grants padrão para service_role (ver 20260702000001).
-- O ALTER DEFAULT PRIVILEGES de lá deveria cobrir, mas explicitar não custa.
GRANT SELECT, INSERT, UPDATE ON public.trinks_webhook_events TO service_role;
GRANT SELECT ON public.trinks_webhook_events TO authenticated;

COMMENT ON TABLE public.trinks_webhook_events IS
  'Caixa de entrada bruta dos webhooks do Trinks (SNS). Imutável; camadas organizadas derivam daqui. Contém dados pessoais com consentimento LGPD.';
