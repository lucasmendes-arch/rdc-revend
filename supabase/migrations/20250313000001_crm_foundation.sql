-- ============================================================================
-- CRM Foundation — Etapa 1
-- Tables: crm_events, crm_tags, crm_customer_tags,
--         crm_automations, crm_automation_runs, processed_webhooks
-- RLS: all new tables secured via public.is_admin()
-- ============================================================================

-- ============================================================================
-- 1. CRM_EVENTS
--    Registro de eventos do funil por usuário/sessão.
--    Alinha com os status atuais de client_sessions.
-- ============================================================================

CREATE TABLE public.crm_events (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users ON DELETE SET NULL,
  session_id    text,       -- referência lógica a client_sessions.session_id
  event_type    text        NOT NULL CHECK (event_type IN (
                              'visitou',
                              'visualizou_produto',
                              'adicionou_carrinho',
                              'iniciou_checkout',
                              'comprou',
                              'abandonou',
                              'tag_added',
                              'order_created'
                            )),
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_events_user_id     ON public.crm_events(user_id);
CREATE INDEX idx_crm_events_session_id  ON public.crm_events(session_id);
CREATE INDEX idx_crm_events_event_type  ON public.crm_events(event_type);
CREATE INDEX idx_crm_events_created_at  ON public.crm_events(created_at DESC);

ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

-- Admin: leitura e escrita total
CREATE POLICY "admin_manage_crm_events" ON public.crm_events
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Sistema pode inserir eventos sem user autenticado (ex: webhooks via edge function)
-- → escrita feita via edge functions com service_role; sem policy adicional necessária

-- ============================================================================
-- 2. CRM_TAGS
--    Catálogo de tags: type='system' (fixas) ou type='custom' (admin cria)
-- ============================================================================

CREATE TABLE public.crm_tags (
  id          uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text  NOT NULL,
  slug        text  NOT NULL UNIQUE,
  color       text  NOT NULL DEFAULT '#6B7280',
  type        text  NOT NULL DEFAULT 'custom' CHECK (type IN ('system', 'custom')),
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_tags_slug ON public.crm_tags(slug);
CREATE INDEX idx_crm_tags_type ON public.crm_tags(type);

ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_crm_tags" ON public.crm_tags
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 3. CRM_CUSTOMER_TAGS
--    Junção usuario ↔ tag. Um usuário não pode ter a mesma tag duas vezes.
-- ============================================================================

CREATE TABLE public.crm_customer_tags (
  id          uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid  NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tag_id      uuid  NOT NULL REFERENCES public.crm_tags ON DELETE CASCADE,
  source      text  NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automation', 'system')),
  assigned_by uuid  REFERENCES auth.users ON DELETE SET NULL, -- admin que atribuiu manualmente
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (user_id, tag_id)
);

CREATE INDEX idx_crm_customer_tags_user_id ON public.crm_customer_tags(user_id);
CREATE INDEX idx_crm_customer_tags_tag_id  ON public.crm_customer_tags(tag_id);

ALTER TABLE public.crm_customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_crm_customer_tags" ON public.crm_customer_tags
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 4. CRM_AUTOMATIONS
--    Definições de automações. Canal: whatsapp apenas (Etapa 1).
-- ============================================================================

CREATE TABLE public.crm_automations (
  id                  uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  name                text  NOT NULL,
  trigger_type        text  NOT NULL CHECK (trigger_type IN (
                              'funnel_status_changed',
                              'tag_added',
                              'order_created',
                              'abandon_cart'
                            )),
  -- Ex: {"from_status": "adicionou_carrinho", "to_status": "abandonou"}
  trigger_conditions  jsonb NOT NULL DEFAULT '{}',
  action_type         text  NOT NULL DEFAULT 'send_whatsapp' CHECK (action_type IN ('send_whatsapp')),
  -- Ex: {"template": "Olá {nome}...", "phone_field": "customer_whatsapp", "delay_minutes": 30}
  action_config       jsonb NOT NULL DEFAULT '{}',
  channel             text  NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_automations_trigger_type ON public.crm_automations(trigger_type);
CREATE INDEX idx_crm_automations_is_active    ON public.crm_automations(is_active);

ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_crm_automations" ON public.crm_automations
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger: auto-atualiza updated_at
CREATE OR REPLACE FUNCTION public.update_crm_automations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_automations_updated_at
  BEFORE UPDATE ON public.crm_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_crm_automations_updated_at();

-- ============================================================================
-- 5. CRM_AUTOMATION_RUNS
--    Log de cada disparo. Idempotência via idempotency_key (UNIQUE).
--    Guarda payload, resposta, erro e tentativas.
-- ============================================================================

CREATE TABLE public.crm_automation_runs (
  id               uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id    uuid  NOT NULL REFERENCES public.crm_automations ON DELETE CASCADE,
  user_id          uuid  REFERENCES auth.users ON DELETE SET NULL,
  session_id       text, -- referência lógica
  trigger_event    jsonb NOT NULL DEFAULT '{}',  -- snapshot do evento que disparou
  action_payload   jsonb NOT NULL DEFAULT '{}',  -- o que foi enviado (ex: mensagem WA)
  action_response  jsonb,                        -- resposta da API (ex: Fiqon/Z-API)
  status           text  NOT NULL DEFAULT 'pending' CHECK (status IN (
                           'pending', 'running', 'success', 'failed', 'skipped'
                         )),
  error_message    text,
  attempt_count    int   NOT NULL DEFAULT 0,
  -- chave única para idempotência: ex: "automation_{id}_user_{user_id}_event_{type}"
  idempotency_key  text  NOT NULL UNIQUE,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_automation_runs_automation_id    ON public.crm_automation_runs(automation_id);
CREATE INDEX idx_crm_automation_runs_user_id          ON public.crm_automation_runs(user_id);
CREATE INDEX idx_crm_automation_runs_status           ON public.crm_automation_runs(status);
CREATE INDEX idx_crm_automation_runs_idempotency_key  ON public.crm_automation_runs(idempotency_key);
CREATE INDEX idx_crm_automation_runs_created_at       ON public.crm_automation_runs(created_at DESC);

ALTER TABLE public.crm_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_crm_automation_runs" ON public.crm_automation_runs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger: auto-atualiza updated_at
CREATE OR REPLACE FUNCTION public.update_crm_automation_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_automation_runs_updated_at
  BEFORE UPDATE ON public.crm_automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_crm_automation_runs_updated_at();

-- ============================================================================
-- 6. PROCESSED_WEBHOOKS
--    Idempotência para webhooks externos (MercadoPago, Nuvemshop, futuros).
--    PK composta (source, external_id) garante unicidade por fonte.
-- ============================================================================

CREATE TABLE public.processed_webhooks (
  source        text  NOT NULL, -- ex: 'mercadopago', 'nuvemshop', 'fiqon'
  external_id   text  NOT NULL, -- ID único do evento na fonte
  payload       jsonb NOT NULL DEFAULT '{}',
  result        jsonb,
  processed_at  timestamptz DEFAULT now(),
  PRIMARY KEY (source, external_id)
);

CREATE INDEX idx_processed_webhooks_processed_at ON public.processed_webhooks(processed_at DESC);

-- Tabela interna de sistema: sem RLS (acesso via service_role nas edge functions)
ALTER TABLE public.processed_webhooks DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. FUNÇÃO DE DEBUG ADMIN — get_crm_customer_debug(p_user_id uuid)
--    SECURITY DEFINER: admin chama via RPC, função lê tudo sem bloqueio de RLS.
--    Retorna JSONB consolidado para a debug screen.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_crm_customer_debug(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(

    -- Perfil completo do cliente
    'profile', (
      SELECT to_jsonb(p.*)
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),

    -- Sessão mais recente no funil
    'session', (
      SELECT to_jsonb(cs.*)
      FROM public.client_sessions cs
      WHERE cs.user_id = p_user_id
      ORDER BY cs.updated_at DESC
      LIMIT 1
    ),

    -- Últimos 20 eventos CRM
    'recent_events', (
      SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM public.crm_events
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 20
      ) e
    ),

    -- Tags ativas do cliente
    'active_tags', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'tag_id',      t.id,
          'name',        t.name,
          'slug',        t.slug,
          'color',       t.color,
          'type',        t.type,
          'source',      ct.source,
          'assigned_at', ct.assigned_at
        )
      ), '[]'::jsonb)
      FROM public.crm_customer_tags ct
      JOIN public.crm_tags t ON t.id = ct.tag_id
      WHERE ct.user_id = p_user_id
    ),

    -- Todas as automações cadastradas (ativas + inativas)
    'automations', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM public.crm_automations a
    ),

    -- Últimos 10 runs do cliente
    'recent_runs', (
      SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM public.crm_automation_runs
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 10
      ) r
    ),

    -- Últimos 5 pedidos
    'recent_orders', (
      SELECT COALESCE(jsonb_agg(o ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, status, total, created_at
        FROM public.orders
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 5
      ) o
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Revogar execução pública; apenas authenticated users (admin vai chamar via RLS check no frontend)
REVOKE EXECUTE ON FUNCTION public.get_crm_customer_debug(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_crm_customer_debug(uuid) TO authenticated;

-- ============================================================================
-- 8. SEEDS — Tags de sistema e automações base
-- ============================================================================

-- Tags de sistema (imutáveis, gerenciadas pelo sistema)
INSERT INTO public.crm_tags (name, slug, color, type, description) VALUES
  ('VIP',                    'vip',                    '#F59E0B', 'system', 'Cliente de alto valor ou recorrente estratégico'),
  ('Recorrente',             'recorrente',             '#10B981', 'system', 'Cliente que já fez mais de 1 pedido'),
  ('Novo Cliente',           'novo-cliente',           '#3B82F6', 'system', 'Primeiro pedido realizado'),
  ('Abandonou Carrinho',     'abandonou-carrinho',     '#EF4444', 'system', 'Adicionou ao carrinho mas não finalizou'),
  ('Profissional',           'profissional',           '#8B5CF6', 'system', 'Cadastrado como profissional (is_professional = true)'),
  ('Iniciou Checkout',       'iniciou-checkout',       '#F97316', 'system', 'Chegou à tela de checkout mas não comprou')
ON CONFLICT (slug) DO NOTHING;

-- Automações base (inativas por padrão — admin ativa no painel)
INSERT INTO public.crm_automations (name, trigger_type, trigger_conditions, action_type, action_config, channel, is_active) VALUES
  (
    'Recuperação de Carrinho Abandonado',
    'abandon_cart',
    '{"min_cart_items": 1}'::jsonb,
    'send_whatsapp',
    '{
      "template": "Olá {nome}! 👋\n\nVi que você deixou alguns produtos no carrinho da Rei dos Cachos. Posso te ajudar a finalizar o pedido? 😊\n\nSe tiver alguma dúvida, estou aqui!",
      "phone_field": "customer_whatsapp",
      "delay_minutes": 60
    }'::jsonb,
    'whatsapp',
    false
  ),
  (
    'Boas-vindas Pós-compra',
    'order_created',
    '{}'::jsonb,
    'send_whatsapp',
    '{
      "template": "Olá {nome}! 🎉\n\nSeu pedido #{order_id} foi recebido com sucesso! Em breve nossa equipe entrará em contato para confirmar os detalhes.\n\nObrigada por escolher a Rei dos Cachos! 💛",
      "phone_field": "customer_whatsapp",
      "delay_minutes": 0
    }'::jsonb,
    'whatsapp',
    false
  ),
  (
    'Lembrete: Iniciou Checkout',
    'funnel_status_changed',
    '{"to_status": "iniciou_checkout"}'::jsonb,
    'send_whatsapp',
    '{
      "template": "Olá {nome}! Notei que você começou a finalizar um pedido conosco mas não concluiu. Posso te ajudar? Qualquer dúvida sobre frete, pagamento ou produtos, é só falar! 😊",
      "phone_field": "customer_whatsapp",
      "delay_minutes": 120
    }'::jsonb,
    'whatsapp',
    false
  )
ON CONFLICT DO NOTHING;
