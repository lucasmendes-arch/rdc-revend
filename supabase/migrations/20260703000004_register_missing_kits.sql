-- ============================================================================
-- Migration: 20260703000004_register_missing_kits.sql
-- Registra em kit_components dois kits que ficaram de fora da população
-- automática (20250311000003, baseada no padrão de nome "Kit <linha> c/ ...")
-- e dos fixes manuais (20250311000004/5):
--
--   1. "Kit Banana e Mel c/ Ativador + Shampoo + Máscara 2em1" — produto
--      posterior à população automática; nunca ganhou componentes.
--   2. "Cronograma Capilar 3 Etapas 500g" — é um kit das 3 máscaras do
--      cronograma (Hidratação + Nutrição + Reconstrução), mas o nome não
--      começa com "Kit ", então o padrão nunca casaria.
--
-- Sem linhas em kit_components, esses produtos não eram reconhecidos como
-- kit em nenhum fluxo: apareciam indevidamente na contagem física
-- (stock_countable_products exclui kits por EXISTS em kit_components) e
-- ficavam fora da expansão de kits do webhook de parceiros e da reserva de
-- estoque. Este fix os alinha ao comportamento dos demais kits.
--
-- Mesmo padrão do fix 20250311000004: match por nome ILIKE, qty 1,
-- ON CONFLICT DO NOTHING (idempotente).
-- ============================================================================

-- Kit Banana e Mel → Ativador + Shampoo + Máscara 2em1
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Banana e Mel%'
  AND c.name ILIKE 'Ativador de Cachos Banana e Mel%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Banana e Mel%'
  AND c.name ILIKE 'Shampoo Banana e Mel%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Banana e Mel%'
  AND c.name ILIKE 'Máscara 2em1 Banana e Mel%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

-- Cronograma Capilar 3 Etapas → as 3 máscaras do cronograma
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Cronograma Capilar 3 Etapas%'
  AND c.name ILIKE 'Cronograma Capilar Máscara Hidratação%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Cronograma Capilar 3 Etapas%'
  AND c.name ILIKE 'Cronograma Capilar Máscara Nutrição%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Cronograma Capilar 3 Etapas%'
  AND c.name ILIKE 'Cronograma Capilar Máscara Reconstrução%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
