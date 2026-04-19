-- Adiciona categoria e ordenação na separation_list do payload de parceiro

CREATE OR REPLACE FUNCTION build_partner_order_payload(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_items  jsonb;
  v_sep    jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Itens com flag is_kit e componentes expandidos
  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id',   oi.product_id,
      'product_name', oi.product_name_snapshot,
      'qty',          oi.qty,
      'unit_price',   oi.unit_price_snapshot,
      'line_total',   oi.line_total,
      'is_kit',       (EXISTS(SELECT 1 FROM kit_components kc WHERE kc.kit_product_id = oi.product_id)),
      'components',   COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'product_id',   kc.component_product_id,
          'product_name', cp2.name,
          'qty_per_kit',  kc.quantity,
          'total_qty',    kc.quantity * oi.qty
        ))
        FROM kit_components kc
        JOIN catalog_products cp2 ON cp2.id = kc.component_product_id
        WHERE kc.kit_product_id = oi.product_id),
        '[]'::jsonb
      )
    )
  ) INTO v_items
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  -- Separation list com categoria, ordenada por categoria e nome do produto
  SELECT jsonb_agg(
    jsonb_build_object(
      'category_name', category_name,
      'product_name',  product_name,
      'qty',           total_qty
    )
    ORDER BY category_sort_order ASC NULLS LAST, category_name ASC, product_name ASC
  ) INTO v_sep
  FROM (
    SELECT product_name, SUM(total_qty) AS total_qty, category_name, category_sort_order
    FROM (
      -- Produtos simples (não-kit)
      SELECT
        oi.product_name_snapshot           AS product_name,
        oi.qty::numeric                    AS total_qty,
        COALESCE(cat.name, 'Sem categoria') AS category_name,
        COALESCE(cat.sort_order, 9999)     AS category_sort_order
      FROM order_items oi
      JOIN catalog_products cp ON cp.id = oi.product_id
      LEFT JOIN categories cat ON cat.id = cp.category_id
      WHERE oi.order_id = p_order_id
        AND NOT EXISTS (SELECT 1 FROM kit_components kc WHERE kc.kit_product_id = oi.product_id)

      UNION ALL

      -- Componentes de kit expandidos (usa categoria do componente)
      SELECT
        cp2.name                            AS product_name,
        (kc.quantity * oi.qty)::numeric     AS total_qty,
        COALESCE(cat2.name, 'Sem categoria') AS category_name,
        COALESCE(cat2.sort_order, 9999)     AS category_sort_order
      FROM order_items oi
      JOIN kit_components kc ON kc.kit_product_id = oi.product_id
      JOIN catalog_products cp2 ON cp2.id = kc.component_product_id
      LEFT JOIN categories cat2 ON cat2.id = cp2.category_id
      WHERE oi.order_id = p_order_id
    ) raw
    GROUP BY product_name, category_name, category_sort_order
  ) consolidated;

  RETURN jsonb_build_object(
    'event', 'partner_order_created',
    'order', jsonb_build_object(
      'id',              v_order.id,
      'created_at',      v_order.created_at,
      'status',          v_order.status,
      'total',           v_order.total,
      'subtotal',        v_order.subtotal,
      'discount_amount', v_order.discount_amount,
      'payment_method',  v_order.payment_method,
      'origin',          v_order.origin,
      'notes',           v_order.notes,
      'delivery_method', v_order.delivery_method,
      'customer', jsonb_build_object(
        'name',     v_order.customer_name,
        'whatsapp', v_order.customer_whatsapp,
        'email',    v_order.customer_email
      )
    ),
    'items',           COALESCE(v_items, '[]'::jsonb),
    'separation_list', COALESCE(v_sep,   '[]'::jsonb)
  );
END;
$$;
