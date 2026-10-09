import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { toast } from 'sonner'
import { Loader, Plus, Zap, Tag as TagIcon, MessageSquare, KeyRound, Pencil, Trash2, X, Variable } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { AdminPage, PageTabs, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import ColorSelect from '@/components/rh/ColorSelect'
import AutomationsPanel, { PlaceholderHint, useAutomationVariables, useWhatsappInstances } from '@/components/automations/AutomationsPanel'
import { CANDIDATE_AUTOMATION_CONFIG } from '@/components/automations/entities'
import type { AutomationVariable, RhTag, WhatsappInstance, WhatsappTemplate } from '@/components/automations/types'

// ============================================================
// Tipos e constantes
//
// O construtor de regras em si (cards, editor, ações) vive em
// src/components/automations/ — é compartilhado com a tela de automações do DP,
// que roda o mesmo painel com outro vocabulário. O que sobrou aqui são as abas
// de apoio: variáveis, tags, modelos de mensagem e credenciais de envio.
// ============================================================

interface RhStore { id: string; name: string; slug: string }
interface CredentialStatus { configured: boolean; is_active: boolean; uazapi_url: string | null; token_last4: string | null; updated_at: string | null }

const EMPTY_TAG = { name: '', color: '#6B7280' }
const EMPTY_TEMPLATE = { name: '', body: '' }
const EMPTY_VARIABLE = { key: '', label: '', value: '', help_text: '' }

const TABS = [
  { key: 'automacoes', label: 'Automações', icon: Zap },
  { key: 'variaveis', label: 'Variáveis', icon: Variable },
  { key: 'tags', label: 'Tags', icon: TagIcon },
  { key: 'templates', label: 'Modelos WhatsApp', icon: MessageSquare },
  { key: 'credenciais', label: 'Envio WhatsApp', icon: KeyRound },
] as const
type TabKey = typeof TABS[number]['key']

const inputClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const textareaClass = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const labelClass = 'field-label'

function slugify(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// ============================================================
// Página
// ============================================================

export default function RhAutomacoes() {
  const [tab, setTab] = useState<TabKey>('automacoes')

  return (
    <AdminLayout>
      <AdminPage
        title="Construtor de automações"
        description="Regras que rodam sozinhas quando um candidato muda de etapa, é criado ou tem um prazo vencido"
        width="narrow"
        tabs={<PageTabs<TabKey> items={TABS.map((t) => ({ ...t }))} value={tab} onChange={setTab} />}
      >
        {tab === 'automacoes' && <AutomationsPanel config={CANDIDATE_AUTOMATION_CONFIG} />}
        {tab === 'variaveis' && <VariablesTab />}
        {tab === 'tags' && <TagsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'credenciais' && <CredentialsTab />}
      </AdminPage>
    </AdminLayout>
  )
}


// ============================================================
// Aba: Variáveis
//
// Substituem o nó "Set" que existia no fluxo do n8n: dois campos editados à
// mão antes de mover o lote de candidatos daquela rodada de entrevistas. São
// globais de propósito — o fluxo é editar, mover o lote, editar de novo.
// O valor também é editável direto no kanban de Candidatos, que é onde a
// pessoa está quando precisa trocar.
// ============================================================

function VariablesTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_VARIABLE)
  const [deleteConfirm, setDeleteConfirm] = useState<AutomationVariable | null>(null)

  useEscapeToClose(closeModal, modalOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const { data: variables = [], isLoading } = useAutomationVariables()

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        key: slugify(form.key || form.label),
        label: form.label.trim(),
        value: form.value.trim() || null,
        help_text: form.help_text.trim() || null,
      }
      if (editingId) {
        const { error } = await supabase.from('automation_variables').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('automation_variables')
          .insert({ ...payload, sort_order: variables.length })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-automation-variables'] })
      toast.success(editingId ? 'Variável atualizada' : 'Variável criada')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automation_variables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-automation-variables'] })
      toast.success('Variável excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function closeModal() { setModalOpen(false); setEditingId(null); setForm(EMPTY_VARIABLE) }
  function openEdit(v: AutomationVariable) {
    setEditingId(v.id)
    setForm({ key: v.key, label: v.label, value: v.value ?? '', help_text: v.help_text ?? '' })
    setModalOpen(true)
  }

  const previewKey = slugify(form.key || form.label)

  return (
    <div>
      <p className="text-[13px] text-muted-foreground mb-4">
        Valores que mudam a cada rodada e entram nas mensagens como <code className="text-[12px]">{'{var.chave}'}</code>.
        Os valores também podem ser trocados direto no kanban de Candidatos, antes de mover o lote.
      </p>

      <div className="flex justify-end mb-4">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Nova variável
        </Button>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : variables.length === 0 ? (
        <Panel><EmptyState icon={Variable} title="Nenhuma variável cadastrada" description="Crie uma variável para usar nas mensagens como {var.chave}." /></Panel>
      ) : (
        <div className="space-y-2">
          {variables.map((v) => (
            <div key={v.id} className="px-3 py-2.5 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-medium text-foreground">{v.label}</span>
                <code className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{`{var.${v.key}}`}</code>
                <span className="flex-1" />
                <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => openEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-danger-subtle hover:text-danger" onClick={() => setDeleteConfirm(v)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <p className={`text-[12px] ${v.value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {v.value || 'Sem valor definido — sai vazio na mensagem'}
              </p>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-4">{editingId ? 'Editar variável' : 'Nova variável'}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nome *</label>
                <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} placeholder="Ex: Data da entrevista" />
                {previewKey && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Usar no modelo como <code className="font-mono">{`{var.${previewKey}}`}</code>
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Valor atual</label>
                <input type="text" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputClass} placeholder="Ex: Hoje (16/07)" />
              </div>
              <div>
                <label className={labelClass}>Dica de preenchimento</label>
                <input type="text" value={form.help_text} onChange={(e) => setForm({ ...form, help_text: e.target.value })} className={inputClass} placeholder="Aparece abaixo do campo no kanban" />
              </div>
            </div>
            <div className="flex flex-row-reverse justify-start gap-2 mt-5">
              <Button
                onClick={() => {
                  if (!form.label.trim()) { toast.error('Informe o nome da variável'); return }
                  if (!previewKey) { toast.error('Nome precisa ter ao menos uma letra'); return }
                  saveMutation.mutate()
                }}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir variável</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              Modelos que usam <code className="font-mono text-[12px]">{`{var.${deleteConfirm.key}}`}</code> passam a enviar o placeholder cru na mensagem.
            </p>
            <div className="flex flex-row-reverse justify-start gap-2">
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Aba: Tags
// ============================================================

function TagsTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_TAG)
  const [deleteConfirm, setDeleteConfirm] = useState<RhTag | null>(null)

  useEscapeToClose(closeModal, modalOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const { data: tags = [], isLoading } = useQuery<RhTag[]>({
    queryKey: ['rh-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name')
      if (error) throw error
      return (data || []) as RhTag[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), slug: slugify(form.name), color: form.color }
      if (editingId) {
        const { error } = await supabase.from('tags').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tags').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-tags'] })
      toast.success(editingId ? 'Tag atualizada' : 'Tag criada')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-tags'] })
      toast.success('Tag excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function closeModal() { setModalOpen(false); setEditingId(null); setForm(EMPTY_TAG) }
  function openEdit(t: RhTag) { setEditingId(t.id); setForm({ name: t.name, color: t.color }); setModalOpen(true) }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Nova tag
        </Button>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : tags.length === 0 ? (
        <Panel><EmptyState icon={TagIcon} title="Nenhuma tag cadastrada" description="Tags ajudam a filtrar candidatos no kanban." /></Panel>
      ) : (
        <div className="space-y-2">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="flex-1 text-[13px] font-medium text-foreground">{t.name}</span>
              <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-danger-subtle hover:text-danger" onClick={() => setDeleteConfirm(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-4">{editingId ? 'Editar tag' : 'Nova tag'}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Urgente" />
              </div>
              <div>
                <label className={labelClass}>Cor</label>
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background p-1 cursor-pointer" />
              </div>
            </div>
            <div className="flex flex-row-reverse justify-start gap-2 mt-5">
              <Button
                onClick={() => { if (!form.name.trim()) { toast.error('Informe o nome da tag'); return } saveMutation.mutate() }}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir tag</h2>
            <p className="text-[13px] text-muted-foreground mb-5">"{deleteConfirm.name}" será removida de todos os candidatos que a têm.</p>
            <div className="flex flex-row-reverse justify-start gap-2">
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Aba: Modelos WhatsApp
// ============================================================

function TemplatesTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_TEMPLATE)
  const [deleteConfirm, setDeleteConfirm] = useState<WhatsappTemplate | null>(null)

  useEscapeToClose(closeModal, modalOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const { data: templates = [], isLoading } = useQuery<WhatsappTemplate[]>({
    queryKey: ['rh-whatsapp-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_templates').select('*').order('name')
      if (error) throw error
      return (data || []) as WhatsappTemplate[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), body: form.body.trim() }
      if (editingId) {
        const { error } = await supabase.from('whatsapp_templates').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('whatsapp_templates').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] })
      toast.success(editingId ? 'Modelo atualizado' : 'Modelo criado')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const toggleActive = useMutation({
    mutationFn: async (t: WhatsappTemplate) => {
      const { error } = await supabase.from('whatsapp_templates').update({ is_active: !t.is_active }).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] })
      toast.success('Modelo excluído')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function closeModal() { setModalOpen(false); setEditingId(null); setForm(EMPTY_TEMPLATE) }
  function openEdit(t: WhatsappTemplate) { setEditingId(t.id); setForm({ name: t.name, body: t.body }); setModalOpen(true) }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Novo modelo
        </Button>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : templates.length === 0 ? (
        <Panel><EmptyState icon={MessageSquare} title="Nenhum modelo cadastrado" description="Modelos são as mensagens que as automações enviam no WhatsApp." /></Panel>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="px-3 py-2.5 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-[13px] font-medium text-foreground">{t.name}</span>
                <button onClick={() => toggleActive.mutate(t)} className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${t.is_active ? 'border-success-border bg-success-subtle text-success' : 'border-border bg-muted text-ink-600'}`}>
                  {t.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-danger-subtle hover:text-danger" onClick={() => setDeleteConfirm(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <p className="text-[12px] text-muted-foreground whitespace-pre-line">{t.body}</p>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-md">
            <h2 className="text-[16px] font-semibold text-foreground mb-4">{editingId ? 'Editar modelo' : 'Novo modelo'}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Boas-vindas" />
              </div>
              <div>
                <label className={labelClass}>Mensagem *</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} className={textareaClass} placeholder="Oi {candidate_first_name}! Vimos seu interesse na vaga de {job_role_title}..." />
                {/* Modelos são compartilhados com o DP, mas quem escreve a
                    mensagem aqui está pensando no funil de RH — a dica lista os
                    placeholders dessa entidade. */}
                <PlaceholderHint fixedPlaceholders={CANDIDATE_AUTOMATION_CONFIG.fixedPlaceholders} />
              </div>
            </div>
            <div className="flex flex-row-reverse justify-start gap-2 mt-5">
              <Button
                onClick={() => { if (!form.name.trim() || !form.body.trim()) { toast.error('Preencha nome e mensagem'); return } saveMutation.mutate() }}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir modelo</h2>
            <p className="text-[13px] text-muted-foreground mb-5">"{deleteConfirm.name}" será removido. Automações que o usam vão parar de enviar até serem reconfiguradas.</p>
            <div className="flex flex-row-reverse justify-start gap-2">
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Aba: Credenciais WhatsApp por loja
// ============================================================

function CredentialEditModal({ store, onClose }: { store: RhStore; onClose: () => void }) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_store_whatsapp_credential', {
        p_store_id: store.id, p_uazapi_url: url.trim(), p_uazapi_token: token.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-credential-status', store.id] })
      toast.success('Credencial salva')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-1">Credencial Uazapi</h2>
        <p className="text-[12px] text-muted-foreground mb-4">{store.name}</p>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>URL da instância</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://minha-instancia.uazapi.com" />
          </div>
          <div>
            <label className={labelClass}>Token</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={inputClass} placeholder="Token da instância" />
          </div>
        </div>
        <div className="flex flex-row-reverse justify-start gap-2 mt-5">
          <Button
            onClick={() => { if (!url.trim() || !token.trim()) { toast.error('Preencha URL e token'); return } saveMutation.mutate() }}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

function CredentialStoreRow({ store }: { store: RhStore }) {
  const [editing, setEditing] = useState(false)
  const { data: status, isLoading } = useQuery<CredentialStatus>({
    queryKey: ['rh-whatsapp-credential-status', store.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_whatsapp_credential_status', { p_store_id: store.id })
      if (error) throw error
      return data as CredentialStatus
    },
  })

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
      <span className="flex-1 text-[13px] font-medium text-foreground">{store.name}</span>
      {isLoading ? (
        <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : status?.configured ? (
        <span className="text-[12px] text-muted-foreground font-mono">•••{status.token_last4}</span>
      ) : (
        <span className="text-[12px] text-muted-foreground">Usa a instância global (não configurada por loja)</span>
      )}
      <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
      {editing && <CredentialEditModal store={store} onClose={() => setEditing(false)} />}
    </div>
  )
}

function InstanceEditModal({ instance, onClose }: { instance: WhatsappInstance | null; onClose: () => void }) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()
  const isEdit = !!instance
  const [name, setName] = useState(instance?.name ?? '')
  const [url, setUrl] = useState(instance?.uazapi_url ?? '')
  const [token, setToken] = useState('')
  const [isActive, setIsActive] = useState(instance?.is_active ?? true)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_upsert_whatsapp_instance', {
        p_id: instance?.id ?? null,
        p_name: name.trim(),
        p_uazapi_url: url.trim(),
        p_uazapi_token: token.trim(),
        p_is_active: isActive,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-instances'] })
      toast.success(isEdit ? 'Instância atualizada' : 'Instância criada')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-4">{isEdit ? 'Editar instância' : 'Nova instância'}</h2>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Nome *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex: RH — número principal" />
          </div>
          <div>
            <label className={labelClass}>URL da instância *</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://minha-instancia.uazapi.com" />
          </div>
          <div>
            <label className={labelClass}>Token {isEdit ? '' : '*'}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={inputClass}
              placeholder={isEdit ? `Deixe vazio pra manter •••${instance!.token_last4}` : 'Token da instância'} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-border accent-ink-700" />
            <span className="text-[13px] text-foreground">Ativa</span>
          </label>
        </div>
        <div className="flex flex-row-reverse justify-start gap-2 mt-5">
          <Button
            onClick={() => {
              if (!name.trim() || !url.trim()) { toast.error('Preencha nome e URL'); return }
              if (!isEdit && !token.trim()) { toast.error('Informe o token'); return }
              saveMutation.mutate()
            }}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

function CredentialsTab() {
  const queryClient = useQueryClient()
  const [editingInstance, setEditingInstance] = useState<WhatsappInstance | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<WhatsappInstance | null>(null)

  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const { data: instances = [], isLoading: loadingInstances } = useWhatsappInstances()

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_delete_whatsapp_instance', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-instances'] })
      toast.success('Instância excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const { data: stores = [], isLoading: loadingStores } = useQuery<RhStore[]>({
    queryKey: ['rh-stores-with-slug'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug').order('name')
      if (error) throw error
      return (data || []) as RhStore[]
    },
  })

  return (
    <div className="space-y-8">
      <div className="p-3 rounded-lg bg-surface border border-border">
        <p className="text-[13px] font-medium text-foreground mb-1">Ordem de resolução do envio</p>
        <p className="text-[12px] text-muted-foreground">
          1. Instância escolhida na ação "Enviar WhatsApp" da automação · 2. Instância da loja do candidato · 3. Instância global do negócio.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">Instâncias</h3>
            <p className="text-[12px] text-muted-foreground">Selecionáveis por automação.</p>
          </div>
          <Button className="shrink-0" onClick={() => setEditingInstance('new')}>
            <Plus className="w-4 h-4" /> Nova instância
          </Button>
        </div>
        {loadingInstances ? (
          <PageLoading className="py-8" />
        ) : instances.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-8 rounded-lg border border-dashed border-border">Nenhuma instância cadastrada — as automações caem na instância da loja ou na global.</p>
        ) : (
          <div className="space-y-2">
            {instances.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{i.name}</p>
                  <p className="text-[12px] text-muted-foreground truncate">{i.uazapi_url}</p>
                </div>
                <span className="text-[12px] text-muted-foreground font-mono shrink-0">•••{i.token_last4}</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${i.is_active ? 'border-success-border bg-success-subtle text-success' : 'border-border bg-muted text-ink-600'}`}>
                  {i.is_active ? 'Ativa' : 'Inativa'}
                </span>
                <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setEditingInstance(i)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-danger-subtle hover:text-danger" onClick={() => setDeleteConfirm(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[14px] font-semibold text-foreground mb-0.5">Instância por loja</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Fallback pra automação que não escolheu instância. Sem nada configurado aqui, cai na instância global do negócio.
        </p>
        {loadingStores ? (
          <PageLoading className="py-8" />
        ) : (
          <div className="space-y-2">
            {stores.map((s) => <CredentialStoreRow key={s.id} store={s} />)}
          </div>
        )}
      </section>

      {editingInstance && (
        <InstanceEditModal
          instance={editingInstance === 'new' ? null : editingInstance}
          onClose={() => setEditingInstance(null)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir instância</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              "{deleteConfirm.name}" será removida. Automações que a usavam voltam a enviar pela instância da loja.
            </p>
            <div className="flex flex-row-reverse justify-start gap-2">
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
