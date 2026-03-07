-- Auto-populate kit_components based on naming patterns
-- Each kit "Kit X c/ Ativador + Shampoo + Mascara" maps to:
--   1x Ativador matching X
--   1x Shampoo matching X
--   1x Mascara matching X

-- Helper: normalize text for matching (lowercase, remove accents-like chars)
CREATE OR REPLACE FUNCTION pg_temp.extract_kit_line(kit_name text)
RETURNS text AS $$
DECLARE
  line_name text;
BEGIN
  -- Extract the line name from "Kit <LINE> c/ ..." pattern
  line_name := regexp_replace(kit_name, '^Kit\s+', '', 'i');
  line_name := regexp_replace(line_name, '\s+c/.*$', '', 'i');
  line_name := trim(line_name);
  RETURN line_name;
END;
$$ LANGUAGE plpgsql;

-- Insert kit components by matching line names
DO $$
DECLARE
  kit RECORD;
  line_name text;
  comp RECORD;
  found_count int;
BEGIN
  FOR kit IN
    SELECT id, name FROM catalog_products
    WHERE name ILIKE 'Kit %' AND name ILIKE '%c/%'
    AND is_active = true
  LOOP
    line_name := pg_temp.extract_kit_line(kit.name);
    found_count := 0;

    -- Find matching Ativador
    FOR comp IN
      SELECT id FROM catalog_products
      WHERE name ILIKE '%ativador%' AND name ILIKE '%' || line_name || '%'
      AND name NOT ILIKE 'Kit %'
      AND is_active = true
      LIMIT 1
    LOOP
      INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
      VALUES (kit.id, comp.id, 1)
      ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
      found_count := found_count + 1;
    END LOOP;

    -- Find matching Shampoo
    FOR comp IN
      SELECT id FROM catalog_products
      WHERE name ILIKE '%shampoo%' AND name ILIKE '%' || line_name || '%'
      AND name NOT ILIKE 'Kit %'
      AND is_active = true
      LIMIT 1
    LOOP
      INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
      VALUES (kit.id, comp.id, 1)
      ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
      found_count := found_count + 1;
    END LOOP;

    -- Find matching Mascara
    FOR comp IN
      SELECT id FROM catalog_products
      WHERE (name ILIKE '%máscara%' OR name ILIKE '%mascara%')
      AND name ILIKE '%' || line_name || '%'
      AND name NOT ILIKE 'Kit %'
      AND is_active = true
      LIMIT 1
    LOOP
      INSERT INTO kit_components (kit_product_id, component_product_id, quantity)
      VALUES (kit.id, comp.id, 1)
      ON CONFLICT (kit_product_id, component_product_id) DO NOTHING;
      found_count := found_count + 1;
    END LOOP;

    RAISE NOTICE 'Kit "%" (line: "%") -> % components found', kit.name, line_name, found_count;
  END LOOP;
END;
$$;
