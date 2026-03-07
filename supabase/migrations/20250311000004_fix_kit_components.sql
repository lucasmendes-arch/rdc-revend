-- Fix kits that weren't matched: Óleo de Coco, Açaí, Argan Teen
-- Also handle the 2 professional kits separately

-- Kit Óleo de Coco -> components have "Coco" in name (not "Óleo de Coco")
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Óleo de Coco%'
  AND c.name ILIKE 'Ativador de Cachos Coco%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Óleo de Coco%'
  AND c.name ILIKE 'Shampoo Coco%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Óleo de Coco%'
  AND c.name ILIKE 'Máscara 2em1 Coco%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

-- Kit Açaí -> components have "Açai" (without accent on i)
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Açaí%'
  AND c.name ILIKE 'Ativador de Cachos Açai%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Açaí%'
  AND c.name ILIKE 'Shampoo Açai%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Açaí%'
  AND (c.name ILIKE 'Máscara 2em1 Açai%' OR c.name ILIKE 'Máscara 2em1 Açaí%')
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

-- Kit Argan Teen -> Mascara is named "Teen Argan Oil" not "Argan Teen"
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
SELECT k.id, c.id, 1
FROM catalog_products k, catalog_products c
WHERE k.name ILIKE 'Kit Argan Teen%'
  AND c.name ILIKE 'Máscara 2em1 Teen Argan%'
  AND c.is_active = true
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
