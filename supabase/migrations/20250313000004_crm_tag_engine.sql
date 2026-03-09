-- ============================================================================
-- CRM Etapa 3 P1 — Motor de Tags Híbridas
--
-- Arquitetura: trigger AFTER INSERT em crm_events dispara atribuição automática
-- de tags em crm_customer_tags. Sem IA, sem scoring, sem disparos WhatsApp.
-- Princípio: evento → tag. Simples, determinístico, auditável.
--
-- Funções criadas:
--   assign_crm_tag(user_id, slug, source)  — helper idempotente
--   remove_crm_tag(user_id, slug)          — helper de remoção
--   apply_crm_tags_from_event()            — função de trigger
--   backfill_crm_tags()                    — retroativo para usuários existentes
--
-- Trigger: crm_events_apply_tags (AFTER INSERT ON crm_events)
-- ============================================================================


-- ============================================================================
-- 1. SEED — Tag adicional para o motor de eventos
--    As demais (novo-cliente, recorrente, abandonou-carrinho, iniciou-checkout)
--    já existem desde a migration 000001.
-- ============================================================================

INSERT INTO public.crm_tags (name, slug, color, type, description)
VALUES (
  'Adicionou ao Carrinho',
  'adicionou-carrinho',
  '#FBBF24',
  'system',
  'Adicionou ao menos um produto ao carrinho e ainda nao comprou'
)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- 2. assign_crm_tag — atribui uma tag a um usuario (idempotente via ON CONFLICT)
--    Chamada pelo trigger e pelo backfill. Nao exposta ao frontend.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_crm_tag(
  p_user_id uuid,
  p_slug    text,
  p_source  text DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_id uuid;
BEGIN
  SELECT id INTO v_tag_id FROM crm_tags WHERE slug = p_slug;

  IF v_tag_id IS NULL THEN
    RAISE WARNING '[CRM Tags] assign_crm_tag: slug nao encontrado: %', p_slug;
    RETURN;
  END IF;

  INSERT INTO crm_customer_tags (user_id, tag_id, source)
  VALUES (p_user_id, v_tag_id, p_source)
  ON CONFLICT (user_id, tag_id) DO NOTHING;
END;
$$;


-- ============================================================================
-- 3. remove_crm_tag — remove uma tag de um usuario
--    Usada quando o usuario avanca no funil (ex: comprou apos abandonar).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_crm_tag(
  p_user_id uuid,
  p_slug    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_id uuid;
BEGIN
  SELECT id INTO v_tag_id FROM crm_tags WHERE slug = p_slug;
  IF v_tag_id IS NULL THEN RETURN; END IF;

  DELETE FROM crm_customer_tags
  WHERE user_id = p_user_id AND tag_id = v_tag_id;
END;
$$;


-- ============================================================================
-- 4. apply_crm_tags_from_event — funcao do trigger
--
-- Mapeamento evento → tag:
--
--   purchase_completed (1a compra) → novo-cliente
--                                    remove: adicionou-carrinho, iniciou-checkout,
--                                            abandonou-carrinho
--   purchase_completed (2a+ compra) → recorrente
--                                      remove: novo-cliente + tags acima
--   cart_abandoned      → abandonou-carrinho
--   iniciou_checkout    → iniciou-checkout
--   adicionou_carrinho  → adicionou-carrinho
--
-- Eventos sem acao: visitou, visualizou_produto, user_registered, tag_added, etc.
-- Eventos anonimos (user_id IS NULL): ignorados silenciosamente.
-- Erros: capturados via EXCEPTION, nao travam o INSERT de crm_events.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_crm_tags_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_count integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'purchase_completed' THEN

    -- Limpar tags de funil: usuario converteu, essas tags nao fazem mais sentido
    PERFORM remove_crm_tag(NEW.user_id, 'adicionou-carrinho');
    PERFORM remove_crm_tag(NEW.user_id, 'iniciou-checkout');
    PERFORM remove_crm_tag(NEW.user_id, 'abandonou-carrinho');

    -- Contar compras pagas para determinar novo-cliente vs recorrente
    SELECT COUNT(*) INTO v_purchase_count
    FROM public.orders
    WHERE user_id = NEW.user_id AND status = 'pago';

    IF v_purchase_count = 1 THEN
      PERFORM assign_crm_tag(NEW.user_id, 'novo-cliente', 'system');

    ELSIF v_purchase_count > 1 THEN
      PERFORM remove_crm_tag(NEW.user_id, 'novo-cliente');
      PERFORM assign_crm_tag(NEW.user_id, 'recorrente', 'system');

    END IF;

  ELSIF NEW.event_type = 'cart_abandoned' THEN
    PERFORM assign_crm_tag(NEW.user_id, 'abandonou-carrinho', 'system');

  ELSIF NEW.event_type = 'iniciou_checkout' THEN
    PERFORM assign_crm_tag(NEW.user_id, 'iniciou-checkout', 'system');

  ELSIF NEW.event_type = 'adicionou_carrinho' THEN
    PERFORM assign_crm_tag(NEW.user_id, 'adicionou-carrinho', 'system');

  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Nunca deixar erro de tag quebrar o INSERT de crm_events
  RAISE WARNING '[CRM Tag Engine] Erro no evento % para user %: %',
    NEW.event_type, NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 5. TRIGGER — dispara apos cada INSERT em crm_events
-- ============================================================================

DROP TRIGGER IF EXISTS crm_events_apply_tags ON public.crm_events;

CREATE TRIGGER crm_events_apply_tags
  AFTER INSERT ON public.crm_events
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_crm_tags_from_event();


-- ============================================================================
-- 6. backfill_crm_tags — aplica tags retroativamente em usuarios existentes
--
-- Logica baseada no estado atual das tabelas (nao reprocessa eventos em ordem).
-- Segura para rodar multiplas vezes: assign usa ON CONFLICT DO NOTHING.
-- Executar uma vez via SQL Editor apos aplicar esta migration.
--
-- Ordem de processamento:
--   1. Compradores (orders.status='pago') — tem prioridade, limpam tags de funil
--   2. Abandonadores de carrinho (sem compra confirmada)
--   3. Iniciadores de checkout (sem compra confirmada)
--   4. Adicionadores ao carrinho (sem compra confirmada)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.backfill_crm_tags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row            RECORD;
  v_purchase_count integer;
  v_count          integer := 0;
BEGIN

  -- Compradores: atribuir novo-cliente ou recorrente
  FOR v_row IN
    SELECT DISTINCT user_id
    FROM public.orders
    WHERE user_id IS NOT NULL
      AND status = 'pago'
  LOOP
    SELECT COUNT(*) INTO v_purchase_count
    FROM public.orders
    WHERE user_id = v_row.user_id AND status = 'pago';

    -- Limpar tags de funil antes de classificar
    PERFORM remove_crm_tag(v_row.user_id, 'adicionou-carrinho');
    PERFORM remove_crm_tag(v_row.user_id, 'iniciou-checkout');
    PERFORM remove_crm_tag(v_row.user_id, 'abandonou-carrinho');

    IF v_purchase_count = 1 THEN
      PERFORM assign_crm_tag(v_row.user_id, 'novo-cliente', 'system');
    ELSIF v_purchase_count > 1 THEN
      PERFORM remove_crm_tag(v_row.user_id, 'novo-cliente');
      PERFORM assign_crm_tag(v_row.user_id, 'recorrente', 'system');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Abandonadores de carrinho (apenas quem nao comprou)
  FOR v_row IN
    SELECT DISTINCT e.user_id
    FROM public.crm_events e
    WHERE e.event_type = 'cart_abandoned'
      AND e.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = e.user_id AND o.status = 'pago'
      )
  LOOP
    PERFORM assign_crm_tag(v_row.user_id, 'abandonou-carrinho', 'system');
    v_count := v_count + 1;
  END LOOP;

  -- Iniciadores de checkout (apenas quem nao comprou)
  FOR v_row IN
    SELECT DISTINCT e.user_id
    FROM public.crm_events e
    WHERE e.event_type = 'iniciou_checkout'
      AND e.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = e.user_id AND o.status = 'pago'
      )
  LOOP
    PERFORM assign_crm_tag(v_row.user_id, 'iniciou-checkout', 'system');
    v_count := v_count + 1;
  END LOOP;

  -- Adicionadores ao carrinho (apenas quem nao comprou)
  FOR v_row IN
    SELECT DISTINCT e.user_id
    FROM public.crm_events e
    WHERE e.event_type = 'adicionou_carrinho'
      AND e.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = e.user_id AND o.status = 'pago'
      )
  LOOP
    PERFORM assign_crm_tag(v_row.user_id, 'adicionou-carrinho', 'system');
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '[CRM Tags] Backfill concluido: % usuarios processados', v_count;
  RETURN v_count;
END;
$$;
