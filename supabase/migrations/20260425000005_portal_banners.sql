-- Banners editoriais da seção "Lançamentos" do Portal do Parceiro
-- Substituem a lógica baseada em catalog_products.is_new_arrival para essa seção

CREATE TABLE public.portal_banners (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  badge_text   text        NOT NULL DEFAULT 'Lançamento',
  image_url    text,
  redirect_url text        NOT NULL DEFAULT '/catalogo',
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_banners ENABLE ROW LEVEL SECURITY;

-- Admins: acesso total
CREATE POLICY "portal_banners_admin_all" ON public.portal_banners
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Parceiros autenticados: apenas leitura dos banners ativos
CREATE POLICY "portal_banners_read_active" ON public.portal_banners
  FOR SELECT TO authenticated
  USING (is_active = true);
