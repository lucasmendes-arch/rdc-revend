import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader, Users, Megaphone, Pencil, Trash2, Copy, Lock, Filter } from 'lucide-react'
import { toast } from 'sonner'

import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, EmptyState, PageLoading, Panel } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
  if (isLoading) return <Loader className="w-4 h-4 animate-spin text-ink-300 shrink-0" />
  return (
    <span className="text-right shrink-0">
      <span className="block font-title text-[22px] font-semibold leading-none text-foreground tabular-nums">
        {(data?.total ?? 0).toLocaleString('pt-BR')}
      </span>
      <span className="block text-[12px] text-muted-foreground mt-1 tabular-nums whitespace-nowrap">
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
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="px-5 h-14 shrink-0 border-b border-border flex items-center pr-12">
          <DialogTitle>{initial?.id ? 'Editar segmento' : 'Novo segmento'}</DialogTitle>
          <DialogDescription className="sr-only">Nome, descrição e filtros do público.</DialogDescription>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[1fr_280px]">
          <div className="p-5 space-y-5 md:border-r border-border">
            <label className="block">
              <span className="field-label">Nome</span>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Hidratação sumidas Linhares" />
            </label>
            <label className="block">
              <span className="field-label">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </label>
            <FilterForm value={filters} onChange={setFilters} units={units} showStatus />
          </div>

          <div className="p-5 bg-surface border-t border-border md:border-t-0">
            <p className="text-[12px] font-medium text-muted-foreground">Quem entra</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-title text-[26px] font-semibold leading-tight text-foreground tabular-nums">
                {(preview?.total ?? 0).toLocaleString('pt-BR')}
              </span>
              {isFetching && <Loader className="w-3.5 h-3.5 animate-spin text-ink-300" />}
            </div>
            <p className="text-[12px] text-muted-foreground tabular-nums">
              {(preview?.with_whatsapp ?? 0).toLocaleString('pt-BR')} com WhatsApp
            </p>
            <p className="text-[12px] text-ink-600 mt-3">{describeFilters(filters, units)}</p>
            {!!preview?.rows.length && (
              <ul className="mt-4 pt-3 border-t border-border space-y-2.5">
                {preview.rows.map(c => (
                  <li key={`${c.store_id}:${c.client_key}`} className="text-[12px] min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-foreground truncate">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </span>
                    <span className="block text-muted-foreground tabular-nums">
                      {c.days_since_last_visit != null ? `${c.days_since_last_visit} dias sem vir · ` : ''}{brl(c.total_spent)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 shrink-0 border-t border-border flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader className="animate-spin" />} Salvar segmento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
    toast.success('Segmento excluído')
    qc.invalidateQueries({ queryKey: ['crm-segments'] })
  }

  return (
    <AdminLayout>
      <AdminPage
        title="Segmentos"
        description="Públicos de clientes para acompanhar de perto ou chamar de volta. Contagem ao vivo."
        actions={<Button onClick={() => setEditing(null)}><Plus /> Novo segmento</Button>}
      >
        {isLoading ? (
          <PageLoading label="Carregando segmentos…" />
        ) : segments.length === 0 ? (
          <Panel flush>
            <EmptyState
              icon={Filter}
              title="Nenhum segmento ainda"
              description="Monte um público com os filtros de situação, visitas e gasto para usar em campanhas."
              action={<Button onClick={() => setEditing(null)}><Plus /> Novo segmento</Button>}
            />
          </Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {segments.map(s => (
              <div key={s.id} className="rounded-lg border border-border bg-card shadow-xs p-4 sm:p-5 flex flex-col min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                      <span className="truncate">{s.name}</span>
                      {s.is_system && <Lock className="w-3 h-3 text-ink-400 shrink-0" aria-label="Segmento pronto (não editável)" />}
                    </h3>
                    {s.description && <p className="text-[12.5px] text-muted-foreground mt-1">{s.description}</p>}
                  </div>
                  <SegmentCount filters={s.filters} />
                </div>
                <p className="text-[12px] text-ink-500 mt-3 flex-1">{describeFilters(s.filters, units)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-border">
                  <Button variant="secondary" size="xs" onClick={() => navigate('/admin/crm/clientes', { state: { filters: s.filters } })}>
                    <Users /> Ver clientes
                  </Button>
                  <Button variant="secondary" size="xs" onClick={() => navigate('/admin/crm/campanhas', { state: { segmentId: s.id } })}>
                    <Megaphone /> Nova campanha
                  </Button>
                  <span className="ml-auto flex items-center gap-0.5">
                    {s.is_system ? (
                      <Button variant="ghost" size="xs" onClick={() => setEditing({ name: `${s.name} (cópia)`, description: s.description, filters: s.filters })}>
                        <Copy /> Usar como base
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label="Editar segmento"><Pencil className="!size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(s)} aria-label="Excluir segmento"><Trash2 className="!size-3.5" /></Button>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPage>

      {editing !== undefined && <SegmentEditor initial={editing} units={units} onClose={() => setEditing(undefined)} />}
    </AdminLayout>
  )
}
