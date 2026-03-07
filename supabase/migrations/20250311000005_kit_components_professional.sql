-- Kit Profissional SOS Reparação -> Shampoo SOS 1L + Máscara SOS 1Kg
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
VALUES
  ('87671322-ed86-4ff2-852d-a874248fca40', '09b6ccb2-ee89-4bb0-baf8-6fd6d2a97d0c', 1),
  ('87671322-ed86-4ff2-852d-a874248fca40', '94aa2bb5-106f-4f85-a0e4-851dc5ac33e9', 1)
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;

-- Kit Relax System -> Ativo Relax 1L + Mask Relax 2Kg
INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
VALUES
  ('2c30ffe0-6f78-469d-85ba-24210b6865fd', '57a98dd8-d59e-4437-8bf8-17232381b3e8', 1),
  ('2c30ffe0-6f78-469d-85ba-24210b6865fd', '967d9c02-0629-4aaa-b3f1-54c1dd8f5e75', 1)
ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
