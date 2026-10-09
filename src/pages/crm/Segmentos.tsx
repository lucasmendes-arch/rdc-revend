import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader, Users, Megaphone, Pencil, Trash2, Copy, X, Lock } from 'lucide-react'
import { toast } from 'sonner'

import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import {
  FilterForm, StatusBadge, brl, cleanFilters, describeFilters, searchClients, useCrmUnits,
  type CrmFilters, type CrmUnit,
} from './crmShared'

// Públicos salvos do CRM (salon_segments). Os de sistema vêm semeados pela
// migration e não são editáveis — "Usar como base" cria uma cópia.

export interface Segment {
  id: string
  name: string
  description: string | null
  filters: CrmFilters
  is_system: boolean
  sort_order: number
}

export function useSegments() {
  return useQuery({
    queryKey: ['crm-segments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salon_segments').select('id, name, description, filters, is_system, sort_order')
        .order('is_system', { ascending: false }).order('sort_order').order('created_at')
      if (error) throw error
      return data as Segment[]
    },
  })
}

function SegmentCount({ filters }: { filters: CrmFilters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-segment-count', filters],
    queryFn: () => searchClients(filters, 'last_visit_desc', 1, 0),
  })
  if (isLoading) return <Loader className="w-4 h-4 animate-spin text-ink-300" />
  return (
    <span className="text-right">
      <span className="block text-[22px] font-semibold tracking-tight leading-none text-foreground numeric">
        {(data?.total ?? 0).toLocaleString('pt-BR')}
      </span>
      <span className="block text-[11px] text-muted-foreground mt-1 numeric">
        {(data?.with_whatsapp ?? 0).toLocaleString('pt-BR')} com WhatsApp
      </span>
    </span>
  )
}

function SegmentEditor({ initial, units, onClose }: {
  initial: Partial<Segment> | null
  units: CrmUnit[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [filters, setFilters] = useState<CrmFilters>(initial?.filters ?? { has_whatsapp: true })
  const [debounced, setDebounced] = useState(filters)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 350)
    return () => clearTimeout(t)
  }, [filters])

  const { data: preview, isFetching } = useQuery({
    queryKey: ['crm-segment-preview', debounced],
    queryFn: () => searchClients(debounced, 'days_since_desc', 5, 0),
  })

  async function save() {
    if (!name.trim()) return toast.error('Dê um nome ao segmento')
    setSaving(true)
    const payload = { name: name.trim(), description: description.trim() || null, filters: cleanFilters(filters), updated_at: new Date().toISOString() }
    const { error } = initial?.id
      ? await supabase.from('salon_segments').update(payload).eq('id', initial.id)
      : await supabase.from('salon_segments').insert(payload)
    setSaving(false)
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`)
    toast.success('Segmento salvo')
    qc.invalidateQueries({ queryKey: ['crm-segments'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label="Segmento" className="relative w-full max-w-3xl max-h-[90vh] bg-card rounded-xl border border-border shadow-2xl flex flex-col animate-in fade-in zoom-in-[0.98] duration-150">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {initial?.id ? 'Editar segmento' : 'Novo segmento'}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><X className="w-4 h-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-[1fr_280px]">
          <div className="p-5 space-y-4 md:border-r border-border">
            <label className="block">
              <span className="block text-[12px] font-medium text-ink-600 mb-1">Nome</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex.: Hidratação sumidas Linhares"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-ink-600 mb-1">Descrição (opcional)</span>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <FilterForm value={filters} onChange={setFilters} units={units} showStatus />
          </div>

          <div className="p-5 bg-surface">
            <p className="text-[12px] font-medium text-ink-600">Quem entra</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[28px] font-semibold tracking-tight text-foreground numeric">
                {(preview?.total ?? 0).toLocaleString('pt-BR')}
              </span>
              {isFetching && <Loader className="w-3.5 h-3.5 animate-spin text-ink-300" />}
            </div>
            <p className="text-[11px] text-muted-foreground numeric">
              {(preview?.with_whatsapp ?? 0).toLocaleString('pt-BR')} com WhatsApp
            </p>
            <p className="text-[12px] text-muted-foreground mt-3">{describeFilters(filters, units)}</p>
            <ul className="mt-4 space-y-2">
              {preview?.rows.map(c => (
                <li key={`${c.store_id}:${c.client_key}`} className="text-[12px]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-foreground truncate">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </span>
                  <span className="text-muted-foreground">
                    {c.days_since_last_visit != null ? `${c.days_since_last_visit} dias sem vir · ` : ''}{brl(c.total_spent)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader className="w-4 h-4 animate-spin" />} Salvar segmento
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CrmSegmentos() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: units = [] } = useCrmUnits()
  const { data: segments = [], isLoading } = useSegments()
  const [editing, setEditing] = useState<Partial<Segment> | null | undefined>(undefined)

  async function remove(s: Segment) {
    if (!window.confirm(`Excluir o segmento "${s.name}"? Campanhas já criadas com ele continuam.`)) return
    const { error } = await supabase.from('salon_segments').delete().eq('id', s.id)
    if (error) return toast.error(`Não foi possível excluir: ${error.message}`)
    qc.invalidateQueries({ queryKey: ['crm-segments'] })
  }

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <AdminHeader
          title="Segmentos"
          subtitle="Públicos para olhar de perto ou chamar de volta. Contagem ao vivo."
          actionNode={<Button size="sm" onClick={() => setEditing(null)}><Plus className="w-3.5 h-3.5" /> Novo segmento</Button>}
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-5">
        {isLoading ? (
          <div className="flex justify-center py-24"><Loader className="w-7 h-7 animate-spin text-ink-300" /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {segments.map(s => (
              <div key={s.id} className="surface-card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                      {s.name}
                      {s.is_system && <Lock className="w-3 h-3 text-ink-400" aria-label="Segmento pronto" />}
                    </h3>
                    {s.description && <p className="text-[12px] text-muted-foreground mt-1">{s.description}</p>}
                  </div>
                  <SegmentCount filters={s.filters} />
                </div>
                <p className="text-[11px] text-ink-500 mt-3 flex-1">{describeFilters(s.filters, units)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-border">
                  <Button variant="outline" size="xs" onClick={() => navigate('/admin/crm/clientes', { state: { filters: s.filters } })}>
                    <Users /> Ver clientes
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => navigate('/admin/crm/campanhas', { state: { segmentId: s.id } })}>
                    <Megaphone /> Criar campanha
                  </Button>
                  <span className="ml-auto flex items-center gap-0.5">
                    {s.is_system ? (
                      <Button variant="ghost" size="xs" onClick={() => setEditing({ name: `${s.name} (cópia)`, description: s.description, filters: s.filters })}>
                        <Copy /> Usar como base
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(s)} aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== undefined && <SegmentEditor initial={editing} units={units} onClose={() => setEditing(undefined)} />}
    </AdminLayout>
  )
}
