-- ============================================================================
-- Dashboard Trinks — faturamento por unidade
--
-- Coleta horária dos dados do Trinks (sistema de gestão dos salões) para
-- alimentar /admin/unidades. A autenticação reusa o host de sessões já
-- existente (Puppeteer mantém login por unidade e devolve cookieString).
--
-- Tabelas:
--   trinks_units             — mapa unidade Trinks <-> stores (+ rota de cookie)
--   trinks_sessions          — cache de sessão (o host leva 17–47s por login)
--   trinks_daily_revenue     — série diária consolidada por unidade
--   trinks_service_sales     — ranking de serviços por dia
--   trinks_product_sales     — ranking de produtos por dia
--   trinks_professional_sales— produção por profissional por dia
--   trinks_sync_runs         — log de execuções
--
-- Escrita: apenas service_role (edge function sync-trinks). Nenhuma policy de
-- INSERT/UPDATE — mesmo padrão de internal_config.
-- Leitura: is_admin() — faturamento é dado sensível.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. trinks_units — mapeamento das unidades
--
-- IDs confirmados empiricamente em 2026-07-28 chamando o host de cookies:
--   rota 1 -> 241717 "Rei dos Cachos Laranjeiras"        -> store 'serra'
--   rota 2 -> 194516 "Rei dos Cachos | Linhares"         -> store 'linhares'
--   rota 3 -> 207853 "Rei dos Cachos | Teixeira"         -> store 'teixeira'
--   rota 4 -> 196024 "Rei dos Cachos | Colatina"         -> store 'colatina'
--   rota 5 -> 260078 "Rei dos Cachos | São Gabriel"      -> store 'sao-gabriel'
--
-- Atenção: no Trinks a unidade da Serra chama-se "Laranjeiras" (bairro).
-- Cada unidade tem idConta PRÓPRIO — não é uma conta franqueadora única, então
-- não dá para varrer as unidades trocando só o header id-estabelecimento.
--
-- O Trinks ainda tem Jaguaré (235273) e Vila Valério (230231), fora do escopo:
-- não há rota de cookie no host nem loja correspondente em stores.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_units (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  trinks_establishment_id bigint NOT NULL UNIQUE,
  trinks_account_id       bigint,
  cookie_route            text NOT NULL,
  display_name            text NOT NULL,
  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trinks_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_units" ON public.trinks_units
  FOR SELECT USING (public.is_admin());

INSERT INTO public.trinks_units
  (store_id, trinks_establishment_id, trinks_account_id, cookie_route, display_name)
SELECT s.id, v.est_id, v.acc_id, v.route, v.label
FROM (VALUES
  ('serra',       241717::bigint, 3922400::bigint, 'http://82.25.74.109:3099/cookies/1', 'Rei dos Cachos Laranjeiras'),
  ('linhares',    194516::bigint, 2820244::bigint, 'http://82.25.74.109:3099/cookies/2', 'Rei dos Cachos | Linhares'),
  ('teixeira',    207853::bigint, 3288855::bigint, 'http://82.25.74.109:3099/cookies/3', 'Rei dos Cachos | Teixeira de Freitas'),
  ('colatina',    196024::bigint, 3178071::bigint, 'http://82.25.74.109:3099/cookies/4', 'Rei dos Cachos | Colatina'),
  ('sao-gabriel', 260078::bigint, 4129791::bigint, 'http://82.25.74.109:3099/cookies/5', 'Rei dos Cachos | São Gabriel da Palha')
) AS v(slug, est_id, acc_id, route, label)
JOIN public.stores s ON s.slug = v.slug
ON CONFLICT (trinks_establishment_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. trinks_sessions — cache de sessão por unidade
--
-- Buscar cookie novo custa 17–47s e o host NÃO suporta chamadas concorrentes
-- (validado em 2026-07-28: 5 pedidos quase simultâneos derrubaram o serviço
-- para HTTP 500). Com cache, a maioria das execuções horárias não toca no host.
--
-- Guarda credencial de sessão: RLS ligado e SEM nenhuma policy — nem admin lê,
-- só service_role (que sempre bypassa RLS). Mesmo padrão de internal_config.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_sessions (
  store_id       uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  cookie_string  text NOT NULL,
  id_conta       bigint NOT NULL,
  id_estab       bigint NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  last_ok_at     timestamptz,
  failures       int NOT NULL DEFAULT 0
);

ALTER TABLE public.trinks_sessions ENABLE ROW LEVEL SECURITY;
-- (sem policies: service_role only)


-- ----------------------------------------------------------------------------
-- 3. trinks_daily_revenue — série diária consolidada
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_daily_revenue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date      date NOT NULL,

  gross_revenue      numeric(12,2) NOT NULL DEFAULT 0,
  services_revenue   numeric(12,2) NOT NULL DEFAULT 0,
  products_revenue   numeric(12,2) NOT NULL DEFAULT 0,
  packages_revenue   numeric(12,2) NOT NULL DEFAULT 0,
  discounts          numeric(12,2) NOT NULL DEFAULT 0,
  expenses           numeric(12,2) NOT NULL DEFAULT 0,

  tickets_count      int NOT NULL DEFAULT 0,
  new_customers      int NOT NULL DEFAULT 0,
  appointments_total int NOT NULL DEFAULT 0,
  appointments_done  int NOT NULL DEFAULT 0,
  no_shows           int NOT NULL DEFAULT 0,
  cancellations      int NOT NULL DEFAULT 0,

  synced_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_daily_revenue_unique UNIQUE (store_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_trinks_daily_revenue_date
  ON public.trinks_daily_revenue (business_date DESC, store_id);

ALTER TABLE public.trinks_daily_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_daily_revenue" ON public.trinks_daily_revenue
  FOR SELECT USING (public.is_admin());


-- ----------------------------------------------------------------------------
-- 4. trinks_service_sales / trinks_product_sales
--
-- item_key = ID do item no Trinks quando existir; senão, o nome normalizado.
-- É o que garante idempotência do upsert quando o CSV não traz ID.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_service_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  item_key      text NOT NULL,
  name          text NOT NULL,
  qty           numeric(10,2) NOT NULL DEFAULT 0,
  revenue       numeric(12,2) NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_service_sales_unique UNIQUE (store_id, business_date, item_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_service_sales_date
  ON public.trinks_service_sales (business_date DESC, store_id);

ALTER TABLE public.trinks_service_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_service_sales" ON public.trinks_service_sales
  FOR SELECT USING (public.is_admin());


CREATE TABLE IF NOT EXISTS public.trinks_product_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  item_key      text NOT NULL,
  name          text NOT NULL,
  qty           numeric(10,2) NOT NULL DEFAULT 0,
  revenue       numeric(12,2) NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_product_sales_unique UNIQUE (store_id, business_date, item_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_product_sales_date
  ON public.trinks_product_sales (business_date DESC, store_id);

ALTER TABLE public.trinks_product_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_product_sales" ON public.trinks_product_sales
  FOR SELECT USING (public.is_admin());


-- ----------------------------------------------------------------------------
-- 5. trinks_professional_sales — produção por profissional
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_professional_sales (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date      date NOT NULL,
  professional_key   text NOT NULL,
  professional_name  text NOT NULL,
  services_count     int NOT NULL DEFAULT 0,
  revenue            numeric(12,2) NOT NULL DEFAULT 0,
  commission         numeric(12,2) NOT NULL DEFAULT 0,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_professional_sales_unique UNIQUE (store_id, business_date, professional_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_professional_sales_date
  ON public.trinks_professional_sales (business_date DESC, store_id);

ALTER TABLE public.trinks_professional_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_professional_sales" ON public.trinks_professional_sales
  FOR SELECT USING (public.is_admin());


-- ----------------------------------------------------------------------------
-- 6. trinks_sync_runs — observabilidade
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL DEFAULT 'running',
  window_start   date,
  window_end     date,
  rows_upserted  int NOT NULL DEFAULT 0,
  used_cached_session boolean NOT NULL DEFAULT false,
  trigger_source text NOT NULL DEFAULT 'cron',
  error_detail   jsonb,
  CONSTRAINT trinks_sync_runs_status_check
    CHECK (status IN ('running', 'ok', 'partial', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_trinks_sync_runs_started
  ON public.trinks_sync_runs (started_at DESC);

ALTER TABLE public.trinks_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_sync_runs" ON public.trinks_sync_runs
  FOR SELECT USING (public.is_admin());


-- ----------------------------------------------------------------------------
-- 7. Segredo compartilhado com a edge function (header x-trinks-secret)
--
-- Mesmo padrão de contract_automation_secret (20260722000005): gerado aqui,
-- nunca em arquivo versionado. gen_random_bytes não existe neste projeto.
-- ----------------------------------------------------------------------------
INSERT INTO public.internal_config (key, value)
VALUES (
  'trinks_sync_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (key) DO NOTHING;


COMMENT ON TABLE public.trinks_units IS
  'Mapa unidade Trinks <-> stores. cookie_route aponta para o host que mantém a sessão logada (Puppeteer).';
COMMENT ON TABLE public.trinks_sessions IS
  'Cache de sessão do Trinks. Contém credencial: RLS sem policy, service_role only.';
COMMENT ON COLUMN public.trinks_service_sales.item_key IS
  'ID do item no Trinks quando disponível; senão nome normalizado. Chave de idempotência do upsert.';
