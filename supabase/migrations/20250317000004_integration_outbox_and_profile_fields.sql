-- ============================================================================
-- Etapa 9 — Integration Outbox + Profile fields para n8n/ClickUp
--
-- 1A. Tabela integration_outbox (outbox pattern)
-- 1B. Novas colunas em profiles (CRM externo)
-- 1C. Expandir CHECK de crm_events.event_type
-- 1D. Trigger enqueue_lead_created()
-- 1E. Trigger enqueue_profile_completed()
-- 1F. RPC claim_outbox_items()
-- 1G. RPC reset_stuck_outbox_items()
-- ============================================================================

-- ============================================================================
-- 1A. Tabela integration_outbox
-- ============================================================================

CREATE TABLE public.integration_outbox (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      text          NOT NULL,
  user_id         uuid          REFERENCES auth.users ON DELETE SET NULL,
  payload         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  status          text          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count   int           NOT NULL DEFAULT 0,
  max_attempts    int           NOT NULL DEFAULT 5,
  last_error      text,
  idempotency_key text          UNIQUE,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  delivered_at    timestamptz
);

CREATE INDEX idx_outbox_status_created ON public.integration_outbox(status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX idx_outbox_user_id ON public.integration_outbox(user_id);

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;

-- Somente admin ou service_role acessa
CREATE POLICY "admin_manage_outbox" ON public.integration_outbox
  FOR ALL USING (public.is_admin());

-- service_role bypassa RLS automaticamente no Supabase

-- ============================================================================
-- 1B. Novas colunas em profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clickup_task_id    text,
  ADD COLUMN IF NOT EXISTS lead_source        text,
  ADD COLUMN IF NOT EXISTS lead_status        text,
  ADD COLUMN IF NOT EXISTS assigned_seller    text,
  ADD COLUMN IF NOT EXISTS integration_notes  text,
  ADD COLUMN IF NOT EXISTS last_synced_at     timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by         text;

-- ============================================================================
-- 1C. Expandir CHECK de crm_events.event_type
-- ============================================================================

ALTER TABLE public.crm_events
  DROP CONSTRAINT IF EXISTS crm_events_event_type_check;

ALTER TABLE public.crm_events
  ADD CONSTRAINT crm_events_event_type_check CHECK (event_type IN (
    -- Funnel status
    'visitou',
    'visualizou_produto',
    'adicionou_carrinho',
    'iniciou_checkout',
    'comprou',
    'abandonou',
    -- Lifecycle events
    'user_registered',
    'purchase_completed',
    'cart_abandoned',
    'checkout_abandoned',
    'order_created',
    'tag_added',
    'inactivity_detected',
    -- Integration events (Etapa 9)
    'profile_completed',
    'profile_synced'
  ));

-- ============================================================================
-- 1D. Trigger: enqueue_lead_created()
--     Dispara AFTER INSERT em crm_events quando event_type = 'user_registered'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_lead_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile  record;
  v_email    text;
BEGIN
  -- Só processa user_registered
  IF NEW.event_type <> 'user_registered' THEN
    RETURN NEW;
  END IF;

  -- Ignora se não tem user_id
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Busca profile
  SELECT p.full_name, p.phone, p.business_type, p.document_type, p.document,
         p.address_city, p.address_state, p.lead_source, p.lead_status
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  -- Busca email do auth.users
  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.user_id;

  -- Seta lead_source e lead_status no profile se ainda não definidos
  UPDATE public.profiles
  SET
    lead_source = COALESCE(lead_source, 'site'),
    lead_status = COALESCE(lead_status, 'novo'),
    updated_by  = COALESCE(updated_by, 'system')
  WHERE id = NEW.user_id;

  -- Insere na outbox com idempotency
  INSERT INTO public.integration_outbox (
    event_type,
    user_id,
    payload,
    idempotency_key
  ) VALUES (
    'lead_created',
    NEW.user_id,
    jsonb_build_object(
      'full_name',      v_profile.full_name,
      'email',          v_email,
      'phone',          v_profile.phone,
      'business_type',  v_profile.business_type,
      'document_type',  v_profile.document_type,
      'document',       v_profile.document,
      'address_city',   v_profile.address_city,
      'address_state',  v_profile.address_state,
      'lead_source',    COALESCE(v_profile.lead_source, 'site'),
      'registered_at',  NEW.created_at,
      'catalog_url',    'https://rdc-revend.vercel.app/catalogo'
    ),
    'lead_created:' || NEW.user_id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_lead_created
  AFTER INSERT ON public.crm_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'user_registered')
  EXECUTE FUNCTION public.enqueue_lead_created();

-- ============================================================================
-- 1E. Trigger: enqueue_profile_completed()
--     Dispara AFTER UPDATE em profiles quando document e address_city
--     passam de NULL para preenchidos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_profile_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
BEGIN
  -- Checa se perfil ficou "completo" nesta atualização
  -- Condição: document e address_city agora NOT NULL, e antes pelo menos um era NULL
  IF NEW.document IS NOT NULL
     AND NEW.address_city IS NOT NULL
     AND (OLD.document IS NULL OR OLD.address_city IS NULL)
  THEN
    -- Busca email
    SELECT u.email INTO v_email
    FROM auth.users u
    WHERE u.id = NEW.id;

    -- Registra evento no CRM
    INSERT INTO public.crm_events (user_id, event_type, metadata)
    VALUES (
      NEW.id,
      'profile_completed',
      jsonb_build_object(
        'full_name',     NEW.full_name,
        'document',      NEW.document,
        'address_city',  NEW.address_city,
        'address_state', NEW.address_state
      )
    );

    -- Enfileira na outbox
    INSERT INTO public.integration_outbox (
      event_type,
      user_id,
      payload,
      idempotency_key
    ) VALUES (
      'profile_completed',
      NEW.id,
      jsonb_build_object(
        'full_name',              NEW.full_name,
        'email',                  v_email,
        'phone',                  NEW.phone,
        'business_type',          NEW.business_type,
        'document_type',          NEW.document_type,
        'document',               NEW.document,
        'address_cep',            NEW.address_cep,
        'address_street',         NEW.address_street,
        'address_number',         NEW.address_number,
        'address_complement',     NEW.address_complement,
        'address_neighborhood',   NEW.address_neighborhood,
        'address_city',           NEW.address_city,
        'address_state',          NEW.address_state,
        'lead_source',            NEW.lead_source,
        'completed_at',           now(),
        'catalog_url',            'https://rdc-revend.vercel.app/catalogo'
      ),
      'profile_completed:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_profile_completed
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_profile_completed();

-- ============================================================================
-- 1F. RPC: claim_outbox_items(p_batch_size)
--     FOR UPDATE SKIP LOCKED — seguro para polling concorrente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_outbox_items(p_batch_size int DEFAULT 10)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.integration_outbox o
    WHERE o.status = 'pending'
      AND o.attempt_count < o.max_attempts
    ORDER BY o.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.integration_outbox o
  SET
    status        = 'processing',
    attempt_count = attempt_count + 1,
    processed_at  = now()
  FROM claimed c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

-- ============================================================================
-- 1G. RPC: reset_stuck_outbox_items()
--     Itens em 'processing' há mais de 10 minutos voltam para 'pending'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_stuck_outbox_items()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  WITH reset AS (
    UPDATE public.integration_outbox
    SET status = 'pending'
    WHERE status = 'processing'
      AND processed_at < now() - interval '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM reset;

  RETURN v_count;
END;
$$;
