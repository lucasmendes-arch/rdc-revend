-- ============================================================================
-- Tabela de comissão por profissional × serviço/produto
--
-- Guarda o percentual REAL de comissão que cada profissional recebe em cada
-- item, aprendido dos relatórios CSV de Comissões do Trinks. Só valor real:
-- a estimativa do webhook (commission_estimated) nunca entra aqui, senão a
-- tabela passaria a confirmar o próprio chute.
--
-- Por enquanto é só ALIMENTADA. A estimativa do webhook continua vindo de
-- trinks_commission_pct_guess (20261009000010), que lê o histórico bruto.
-- A ideia é trocar o passo 1 daquela função para ler daqui depois que a
-- tabela for conferida.
--
-- Chave: (store_id, professional, item_key). `professional` é o rótulo do
-- Trinks (apelido, ex.: "3 Cindy") — o mesmo que o webhook usa depois que o
-- nome chega. item_key = nome do item normalizado (minúsculo, sem espaço nas
-- pontas), igual à regra de busca da estimativa.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trinks_commission_rates (
  store_id        uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  professional    text    NOT NULL,
  item_key        text    NOT NULL,
  item_name       text    NOT NULL,          -- como apareceu por último (para exibir)
  item_type       text,                      -- servico / produto / pacote
  commission_pct  numeric NOT NULL,          -- o mais recente visto no CSV
  first_seen_on   date    NOT NULL,
  last_seen_on    date    NOT NULL,          -- data do item que definiu o pct atual
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, professional, item_key)
);

COMMENT ON TABLE public.trinks_commission_rates IS
  'Percentual real de comissão por unidade × profissional × item, aprendido do CSV de Comissões do Trinks. Alimentada por trg_trinks_commission_rates_learn.';

ALTER TABLE public.trinks_commission_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_trinks_commission_rates" ON public.trinks_commission_rates;
CREATE POLICY "admin_read_trinks_commission_rates" ON public.trinks_commission_rates
  FOR SELECT USING (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trinks_commission_rates TO service_role;
GRANT SELECT ON public.trinks_commission_rates TO authenticated;


-- Grava/atualiza a partir de um conjunto de itens do CSV. O mais recente vence:
-- reimportar um período antigo não sobrescreve um percentual mais novo.
CREATE OR REPLACE FUNCTION public.trinks_commission_rates_learn_from(p_rows jsonb)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO trinks_commission_rates AS t (
    store_id, professional, item_key, item_name, item_type,
    commission_pct, first_seen_on, last_seen_on, updated_at
  )
  SELECT DISTINCT ON (store_id, professional, item_key)
         store_id, professional, item_key, item_name, item_type,
         commission_pct, first_seen_on, business_date, now()
    FROM (
      SELECT (r->>'store_id')::uuid             AS store_id,
             btrim(r->>'professional')          AS professional,
             lower(btrim(r->>'item_name'))      AS item_key,
             btrim(r->>'item_name')             AS item_name,
             r->>'item_type'                    AS item_type,
             (r->>'commission_pct')::numeric    AS commission_pct,
             (r->>'business_date')::date        AS business_date,
             min((r->>'business_date')::date) OVER (
               PARTITION BY (r->>'store_id'), btrim(r->>'professional'), lower(btrim(r->>'item_name'))
             )                                  AS first_seen_on
        FROM jsonb_array_elements(p_rows) r
       WHERE coalesce(btrim(r->>'professional'), '') <> ''
         AND coalesce(btrim(r->>'item_name'), '') <> ''
         AND r->>'commission_pct' IS NOT NULL
    ) x
   ORDER BY store_id, professional, item_key, business_date DESC
  ON CONFLICT (store_id, professional, item_key) DO UPDATE SET
    commission_pct = CASE WHEN EXCLUDED.last_seen_on >= t.last_seen_on
                          THEN EXCLUDED.commission_pct ELSE t.commission_pct END,
    item_name      = CASE WHEN EXCLUDED.last_seen_on >= t.last_seen_on
                          THEN EXCLUDED.item_name ELSE t.item_name END,
    item_type      = coalesce(CASE WHEN EXCLUDED.last_seen_on >= t.last_seen_on
                                   THEN EXCLUDED.item_type END, t.item_type),
    last_seen_on   = greatest(t.last_seen_on, EXCLUDED.last_seen_on),
    first_seen_on  = least(t.first_seen_on, EXCLUDED.first_seen_on),
    updated_at     = now();
$$;

-- Trigger por COMANDO (não por linha): uma importação de CSV com milhares de
-- itens vira um único upsert agregado.
CREATE OR REPLACE FUNCTION public.trinks_commission_rates_learn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM trinks_commission_rates_learn_from((
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'store_id', store_id, 'professional', professional, 'item_name', item_name,
             'item_type', item_type, 'commission_pct', commission_pct, 'business_date', business_date)), '[]'::jsonb)
      FROM new_rows
     WHERE source = 'csv' AND commission_pct IS NOT NULL
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_trinks_commission_rates_learn ON public.trinks_sale_items;
CREATE TRIGGER trg_trinks_commission_rates_learn
  AFTER INSERT ON public.trinks_sale_items
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trinks_commission_rates_learn();

-- Carga inicial com todo o histórico do CSV.
SELECT public.trinks_commission_rates_learn_from((
  SELECT jsonb_agg(jsonb_build_object(
           'store_id', store_id, 'professional', professional, 'item_name', item_name,
           'item_type', item_type, 'commission_pct', commission_pct, 'business_date', business_date))
    FROM public.trinks_sale_items
   WHERE source = 'csv' AND commission_pct IS NOT NULL
));
