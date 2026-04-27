import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, GripVertical, X, Eye, EyeOff, ExternalLink } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface PortalBanner {
  id: string
  title: string
  badge_text: string
  image_url: string | null
  redirect_url: string
  is_active: boolean
  sort_order: number
}

type BannerForm = Omit<PortalBanner, 'id' | 'sort_order'>

const EMPTY_FORM: BannerForm = {
  title: '',
  badge_text: 'Lançamento',
  image_url: '',
  redirect_url: '/catalogo',
  is_active: true,
}

function useBanners() {
  return useQuery<PortalBanner[]>({
    queryKey: ['admin-portal-banners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_banners')
        .select('id, title, badge_text, image_url, redirect_url, is_active, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PortalBanner[]
    },
  })
}

export default function AdminPortalBanners() {
  const qc = useQueryClient()
  const { data: banners = [], isLoading } = useBanners()

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<BannerForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<BannerForm>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-portal-banners'] })

  const createMutation = useMutation({
    mutationFn: async (form: BannerForm) => {
      const maxOrder = banners.length > 0 ? Math.max(...banners.map(b => b.sort_order)) : -1
      const { error } = await supabase.from('portal_banners').insert({
        ...form,
        image_url: form.image_url?.trim() || null,
        sort_order: maxOrder + 1,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setCreating(false); setCreateForm(EMPTY_FORM) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: BannerForm }) => {
      const { error } = await supabase.from('portal_banners').update({
        ...form,
        image_url: form.image_url?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portal_banners').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setDeleteId(null) },
  })

  const toggleActive = (banner: PortalBanner) =>
    updateMutation.mutate({ id: banner.id, form: { ...banner, is_active: !banner.is_active } })

  const startEdit = (b: PortalBanner) => {
    setEditingId(b.id)
    setEditForm({ title: b.title, badge_text: b.badge_text, image_url: b.image_url ?? '', redirect_url: b.redirect_url, is_active: b.is_active })
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Banners do Portal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Seção "Lançamentos" visível no Portal do Parceiro
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo banner
            </button>
          )}
        </div>

        {/* Formulário de criação */}
        {creating && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Novo banner</p>
              <button onClick={() => { setCreating(false); setCreateForm(EMPTY_FORM) }} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <BannerFormFields form={createForm} onChange={setCreateForm} />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMutation.mutate(createForm)}
                disabled={!createForm.title.trim() || createMutation.isPending}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {createMutation.isPending ? 'Salvando…' : 'Criar banner'}
              </button>
              <button onClick={() => { setCreating(false); setCreateForm(EMPTY_FORM) }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
            )}
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : banners.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Nenhum banner criado ainda.</p>
            <p className="text-xs mt-1">Os banners aparecem na seção "Lançamentos" do portal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {banners.map(banner => (
              <div key={banner.id} className="bg-card border border-border rounded-xl overflow-hidden">

                {editingId === banner.id ? (
                  /* Modo edição inline */
                  <div className="p-5 space-y-4">
                    <BannerFormFields form={editForm} onChange={setEditForm} />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => updateMutation.mutate({ id: banner.id, form: editForm })}
                        disabled={!editForm.title.trim() || updateMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                      >
                        {updateMutation.isPending ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                      </button>
                    </div>
                    {updateMutation.isError && (
                      <p className="text-sm text-red-600">{(updateMutation.error as Error).message}</p>
                    )}
                  </div>
                ) : (
                  /* Modo visualização */
                  <div className="flex items-center gap-3 p-4">
                    {/* Drag handle (visual) */}
                    <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />

                    {/* Preview da imagem */}
                    <div className="w-16 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {banner.image_url ? (
                        <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                          <span className="text-xl font-black text-amber-200">{banner.title.charAt(0)}</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{banner.title}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide whitespace-nowrap">
                          ✦ {banner.badge_text}
                        </span>
                        {!banner.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inativo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <ExternalLink className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">{banner.redirect_url}</p>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(banner)}
                        title={banner.is_active ? 'Desativar' : 'Ativar'}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {banner.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(banner)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(banner.id)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
              <p className="text-sm font-semibold text-foreground mb-1">Excluir banner?</p>
              <p className="text-xs text-muted-foreground mb-5">
                {banners.find(b => b.id === deleteId)?.title} — essa ação não pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
                </button>
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}

// ─── Formulário reutilizado para criar e editar ────────────────────────────────

function BannerFormFields({ form, onChange }: { form: BannerForm; onChange: (f: BannerForm) => void }) {
  const set = (key: keyof BannerForm, value: string | boolean) =>
    onChange({ ...form, [key]: value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Título do banner *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Ex: Nova linha Cachos Intensos"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Texto da badge</label>
        <input
          type="text"
          value={form.badge_text}
          onChange={e => set('badge_text', e.target.value)}
          placeholder="Ex: Lançamento"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Aparece como "✦ {form.badge_text || 'Lançamento'}"</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Link de redirecionamento *</label>
        <input
          type="text"
          value={form.redirect_url}
          onChange={e => set('redirect_url', e.target.value)}
          placeholder="Ex: /catalogo ou https://..."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Caminho interno (/catalogo) ou URL externa</p>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold text-muted-foreground mb-1">URL da imagem do banner</label>
        <input
          type="text"
          value={form.image_url ?? ''}
          onChange={e => set('image_url', e.target.value)}
          placeholder="https://images.unsplash.com/..."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Deixe vazio para usar imagem placeholder automática. Recomendado: 600×400px, proporção 3:2.
        </p>
        {form.image_url?.trim() && (
          <div className="mt-2 w-full max-w-xs h-28 rounded-lg overflow-hidden border border-border">
            <img
              src={form.image_url}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
      </div>

      <div className="sm:col-span-2 flex items-center gap-2">
        <input
          id="is_active"
          type="checkbox"
          checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)}
          className="w-4 h-4 rounded accent-amber-500"
        />
        <label htmlFor="is_active" className="text-sm text-foreground">Banner ativo (visível no portal)</label>
      </div>

    </div>
  )
}
