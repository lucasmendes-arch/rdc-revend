import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Loader, Plus, UserPlus, ShieldCheck, Store, Users, Search,
  X, Edit2, Check, User, Phone, Mail, FileText, Building2,
  DollarSign, KeyRound, RefreshCw, Lock, Unlock, Copy, Package,
  AlertTriangle, TrendingUp, Briefcase,
} from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemUser {
  id: string
  role: string
  full_name: string | null
  email: string
  created_at: string
  last_sign_in_at: string | null
  permissions: Record<string, boolean> | null
  store_id: string | null
  store_name: string | null
  whatsapp_number: string | null
}

interface StoreOption {
  id: string
  name: string
}

/** Tipo unificado — retornado por get_network_partners e get_all_client_stats */
interface ClientStats {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  document_type: string | null
  document: string | null
  business_type: string | null
  employees: string | null
  revenue: string | null
  customer_segment: string | null
  access_status: string | null
  auth_phone: string | null
  credentials_created_at: string | null
  last_password_reset_at: string | null
  price_list_id: string | null
  price_list_name: string | null
  last_sign_in_at: string | null
  total_purchased: number
  order_count: number
}

interface ClientOrder {
  id: string
  status: string
  total: number
  created_at: string
  order_items: {
    id: string
    product_name_snapshot: string
    qty: number
    unit_price_snapshot: number
    line_total: number
    catalog_products?: { main_image: string | null } | null
  }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', salao: 'Salão', administrativo: 'Administrativo' }
const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  salao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  administrativo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}
const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="w-3.5 h-3.5" />,
  salao: <Store className="w-3.5 h-3.5" />,
  administrativo: <Briefcase className="w-3.5 h-3.5" />,
}

const SEGMENT_OPTIONS = [
  { value: '',                label: 'Não classificado' },
  { value: 'network_partner', label: 'Parceiro da Rede' },
  { value: 'wholesale_buyer', label: 'Comprador Atacado' },
]
const segmentBadge = (v: string | null) => {
  if (v === 'network_partner') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  if (v === 'wholesale_buyer') return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
  return 'bg-muted text-muted-foreground'
}
const segmentLabel = (v: string | null) =>
  SEGMENT_OPTIONS.find(o => o.value === (v || ''))?.label ?? 'Não classificado'

const businessTypeLabels: Record<string, string> = {
  salao: 'Salão de Beleza',
  revenda: 'Revenda',
  loja: 'Loja / Comércio',
}
const employeesLabels: Record<string, string> = {
  somente_eu: 'Somente eu',
  '1-3': '1 a 3 funcionários',
  '4-7': '4 a 7 funcionários',
  '8-10': '8 a 10 funcionários',
  '+10': 'Mais de 10 funcionários',
}
const revenueLabels: Record<string, string> = {
  '1k_5k': 'R$ 1.000 a R$ 5.000/mês',
  '6k_10k': 'R$ 6.000 a R$ 10.000/mês',
  '10k_30k': 'R$ 10.000 a R$ 30.000/mês',
  '30k_50k': 'R$ 30.000 a R$ 50.000/mês',
  'acima_50k': 'Mais de R$ 50.000/mês',
}
const orderStatusLabels: Record<string, { label: string; color: string }> = {
  recebido:             { label: 'Recebido',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  aguardando_pagamento: { label: 'Aguardando Pgto', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  pago:                 { label: 'Pago',            color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  separacao:            { label: 'Separação',       color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  enviado:              { label: 'Enviado',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  entregue:             { label: 'Entregue',        color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  concluido:            { label: 'Concluído',       color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado:            { label: 'Cancelado',       color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  expirado:             { label: 'Expirado',        color: 'bg-muted text-muted-foreground' },
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminUsuarios() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', role: 'salao', store_id: '' })
  const [activeTab, setActiveTab] = useState<'sistema' | 'parceiros' | 'clientes'>('sistema')
  const [creatingPartner, setCreatingPartner] = useState(false)
  const [partnerForm, setPartnerForm] = useState({ full_name: '', phone: '' })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-system-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_system_users')
      if (error) throw error
      return (data || []) as SystemUser[]
    },
    staleTime: 60 * 1000,
  })

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as StoreOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const createUserMutation = useMutation({
    mutationFn: async (form: { email: string; password: string; role: string; store_id: string }) => {
      const data = await callEdgeFunction('create-user', { email: form.email, password: form.password, role: form.role })
      // create-user não recebe store_id — atribui a loja em seguida via RPC,
      // só quando o salão criado também vai fazer contagem de estoque.
      if (form.role === 'salao' && form.store_id && data?.user?.id) {
        const { error } = await supabase.rpc('admin_set_user_role', {
          p_user_id: data.user.id,
          p_role: 'salao',
          p_store_id: form.store_id,
        })
        if (error) throw error
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
      setCreating(false)
      setCreateForm({ email: '', password: '', role: 'salao', store_id: '' })
      alert('Usuário criado com sucesso!')
    },
    onError: (err) => alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role, storeId }: { id: string; role: string; storeId?: string | null }) => {
      const { error } = await supabase.rpc('admin_set_user_role', {
        p_user_id: id,
        p_role: role,
        p_store_id: storeId || null, // '' (Nenhuma) vira NULL, não string vazia
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-system-users'] }),
    onError: (err) => alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`),
  })

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ id, key, value }: { id: string; key: string; value: boolean }) => {
      const { error } = await supabase.rpc('admin_set_user_permission', {
        p_user_id: id,
        p_key: key,
        p_value: value,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
      toast.success('Permissão atualizada')
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  const handleCreate = () => {
    if (!createForm.email || !createForm.password) { alert('Email e senha são obrigatórios'); return }
    if (createForm.password.length < 6) { alert('Senha deve ter pelo menos 6 caracteres'); return }
    createUserMutation.mutate(createForm)
  }

  const createPartnerMutation = useMutation({
    mutationFn: async (form: { full_name: string; phone: string }) => {
      const cleanPhone = form.phone.replace(/\D/g, '')
      const mockEmail  = `parceiro.${Date.now()}.${cleanPhone.slice(-4)}@sememail.local`
      const randomPwd  = Math.random().toString(36).slice(-8) + 'A1!'

      // 1. Criar usuário
      const { data, error: createErr } = await supabase.functions.invoke('create-user', {
        body: { email: mockEmail, password: randomPwd, role: 'user', full_name: form.full_name, phone: form.phone },
      })
      if (createErr) throw createErr

      const newId: string = data.user.id

      // 2. Aguardar trigger criar o profile
      await new Promise(r => setTimeout(r, 1000))

      // 3. Marcar como network_partner
      const { error: segErr } = await supabase.rpc('admin_update_customer_segment', {
        p_user_id: newId,
        p_segment: 'network_partner',
      })
      if (segErr) throw segErr

      return newId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-partners'] })
      setCreatingPartner(false)
      setPartnerForm({ full_name: '', phone: '' })
      toast.success('Parceiro criado!')
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  const tabs = [
    { key: 'sistema',   label: 'Sistema',   icon: ShieldCheck },
    { key: 'parceiros', label: 'Parceiros', icon: TrendingUp },
    { key: 'clientes',  label: 'Clientes',  icon: Users },
  ] as const

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground mt-1">Sistema, parceiros e clientes</p>
          </div>
          {activeTab === 'sistema' && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Usuário</span>
            </button>
          )}
          {activeTab === 'parceiros' && (
            <button onClick={() => setCreatingPartner(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Parceiro</span>
            </button>
          )}
        </div>
        <div className="px-4 sm:px-6 flex gap-1 border-t border-border">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-gold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6">
        {activeTab === 'sistema' && (
          isLoading
            ? <LoadingState label="Carregando..." />
            : <SystemTab
                users={users}
                stores={stores}
                onRoleChange={(id, role, storeId) => updateRoleMutation.mutate({ id, role, storeId })}
                onPermissionChange={(id, key, value) => updatePermissionMutation.mutate({ id, key, value })}
                isPending={updateRoleMutation.isPending || updatePermissionMutation.isPending}
              />
        )}
        {activeTab === 'parceiros' && <ClientStatsTab rpc="get_network_partners" queryKey="network-partners" emptyLabel="Nenhum parceiro da rede cadastrado." showSegment={false} />}
        {activeTab === 'clientes'  && <ClientStatsTab rpc="get_all_client_stats"  queryKey="all-client-stats"  emptyLabel="Nenhum cliente cadastrado."           showSegment />}
      </div>

      {creatingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreatingPartner(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Novo Parceiro</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome completo *</label>
                <input
                  type="text"
                  value={partnerForm.full_name}
                  onChange={e => setPartnerForm({ ...partnerForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nome do parceiro"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Telefone (WhatsApp) *</label>
                <input
                  type="tel"
                  value={partnerForm.phone}
                  onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  if (!partnerForm.full_name.trim()) { toast.error('Nome é obrigatório'); return }
                  if (!partnerForm.phone.replace(/\D/g, '')) { toast.error('Telefone é obrigatório'); return }
                  createPartnerMutation.mutate(partnerForm)
                }}
                disabled={createPartnerMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors">
                {createPartnerMutation.isPending ? 'Criando...' : 'Criar Parceiro'}
              </button>
              <button onClick={() => setCreatingPartner(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Novo Usuário</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tipo de acesso</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['salao', 'administrativo', 'admin'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setCreateForm({ ...createForm, role: r, store_id: r === 'salao' ? createForm.store_id : '' })}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs sm:text-sm font-semibold transition-all ${
                        createForm.role === r
                          ? `${ROLE_STYLES[r]} border-current/30`
                          : 'bg-background text-muted-foreground border-border hover:bg-accent'
                      }`}>
                      {ROLE_ICONS[r]}{ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              {createForm.role === 'salao' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Loja vinculada (opcional)</label>
                  <p className="text-xs text-muted-foreground mb-1.5">Sem loja, o colaborador só acessa o módulo de venda — não o de contagem de estoque.</p>
                  <select
                    value={createForm.store_id}
                    onChange={e => setCreateForm({ ...createForm, store_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Nenhuma (só vendas)</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail *</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="usuario@email.com" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Senha *</label>
                <input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Mínimo 6 caracteres" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreate} disabled={createUserMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors">
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </button>
              <button onClick={() => setCreating(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// ─── Tabela de clientes/parceiros unificada ───────────────────────────────────

function ClientStatsTab({
  rpc,
  queryKey,
  emptyLabel,
  showSegment,
}: {
  rpc: string
  queryKey: string
  emptyLabel: string
  showSegment: boolean
}) {
  const [search, setSearch]       = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpc as any)
      if (error) throw error
      return (data || []) as ClientStats[]
    },
    staleTime: 60 * 1000,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    // Na aba Clientes (showSegment=true), parceiros têm aba própria — excluir aqui
    const base = showSegment
      ? rows.filter(r => r.customer_segment !== 'network_partner')
      : rows
    if (!q) return base
    return base.filter(r =>
      r.full_name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.includes(q)
    )
  }, [rows, search, showSegment])

  const selected = rows.find(r => r.id === selectedId) ?? null

  if (isLoading) return <LoadingState label="Carregando..." />

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nome, e-mail ou telefone..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} {showSegment ? 'cliente' : 'parceiro'}{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {showSegment ? 'Cliente' : 'Parceiro'}
                </th>
                {showSegment && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Segmento</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tabela de Preço</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último Acesso</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Comprado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acesso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={showSegment ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {search ? 'Nenhum resultado encontrado.' : emptyLabel}
                  </td>
                </tr>
              ) : filtered.map((row, i) => (
                <tr key={row.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/30'}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-foreground">{row.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{row.email || row.phone || '—'}</p>
                  </td>
                  {showSegment && (
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${segmentBadge(row.customer_segment)}`}>
                        {segmentLabel(row.customer_segment)}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-foreground">
                    {row.price_list_name || <span className="text-xs text-muted-foreground">Padrão</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {row.last_sign_in_at
                      ? new Date(row.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {row.total_purchased > 0
                        ? `R$ ${Number(row.total_purchased).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </p>
                    {row.order_count > 0 && (
                      <p className="text-[10px] text-muted-foreground">{row.order_count} pedido{row.order_count !== 1 ? 's' : ''}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <AccessBadge status={row.access_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelectedId(row.id)}
                      className="text-xs font-medium text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ClientSidePanel
          client={selected}
          queryKey={queryKey}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}

// ─── Client Side Panel ────────────────────────────────────────────────────────

function ClientSidePanel({
  client,
  queryKey,
  onClose,
}: {
  client: ClientStats
  queryKey: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    full_name:     client.full_name     ?? '',
    phone:         client.phone         ?? '',
    document_type: client.document_type ?? '',
    document:      client.document      ?? '',
    business_type: client.business_type ?? '',
    employees:     client.employees     ?? '',
    revenue:       client.revenue       ?? '',
  })

  const initials = (client.full_name || 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const isPartner = client.customer_segment === 'network_partner'

  const { data: priceLists = [] } = useQuery({
    queryKey: ['admin-price-lists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_lists').select('id, name').eq('is_active', true).order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['client-orders', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, total, created_at,
          order_items(id, product_name_snapshot, qty, unit_price_snapshot, line_total,
            catalog_products(main_image))
        `)
        .eq('user_id', client.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data || []) as ClientOrder[]
    },
    staleTime: 60 * 1000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] })

  const profileMutation = useMutation({
    mutationFn: async (form: typeof profileForm) => {
      const { error } = await supabase.rpc('admin_update_profile', {
        p_user_id:       client.id,
        p_full_name:     form.full_name     || null,
        p_phone:         form.phone         || null,
        p_document_type: form.document_type || null,
        p_document:      form.document      || null,
        p_business_type: form.business_type || null,
        p_employees:     form.employees     || null,
        p_revenue:       form.revenue       || null,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Dados atualizados'); setEditingProfile(false); invalidate() },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  const segmentMutation = useMutation({
    mutationFn: async (segment: string | null) => {
      const { error } = await supabase.rpc('admin_update_customer_segment', { p_user_id: client.id, p_segment: segment })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Segmento atualizado'); invalidate() },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  const priceListMutation = useMutation({
    mutationFn: async (priceListId: string | null) => {
      const { error } = await supabase.rpc('admin_set_profile_price_list', { p_user_id: client.id, p_price_list_id: priceListId })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Tabela de preço atualizada'); invalidate() },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  return (
    <>
      <div className="fixed inset-0 bg-foreground/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-card z-50 shadow-2xl flex flex-col border-l border-border">

        {/* Header */}
        <div className="border-b border-border px-5 py-4 flex items-start gap-3.5 flex-shrink-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isPartner ? 'bg-amber-700' : 'bg-muted-foreground/40'}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">{client.full_name || 'Cliente'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{client.email || client.phone || '—'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${segmentBadge(client.customer_segment)}`}>
                {segmentLabel(client.customer_segment)}
              </span>
              <AccessBadge status={client.access_status} />
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Stats strip */}
          {(client.total_purchased > 0 || client.last_sign_in_at) && (
            <div className="px-5 py-3 border-b border-border flex gap-6">
              {client.total_purchased > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total comprado</p>
                  <p className="text-sm font-bold text-foreground">
                    R$ {Number(client.total_purchased).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    <span className="text-[11px] font-normal text-muted-foreground ml-1">({client.order_count} pedidos)</span>
                  </p>
                </div>
              )}
              {client.last_sign_in_at && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Último acesso</p>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(client.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Dados do Cadastro */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Dados do Cadastro</h3>
              {!editingProfile ? (
                <button onClick={() => {
                  setProfileForm({ full_name: client.full_name ?? '', phone: client.phone ?? '', document_type: client.document_type ?? '', document: client.document ?? '', business_type: client.business_type ?? '', employees: client.employees ?? '', revenue: client.revenue ?? '' })
                  setEditingProfile(true)
                }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground/70 hover:bg-accent border border-border transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingProfile(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-3">
                <FormField label="Nome completo">
                  <input type="text" value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" autoFocus />
                </FormField>
                <FormField label="WhatsApp / Telefone">
                  <input type="text" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Ex: 5527999990000" />
                </FormField>
                <div className="flex gap-2">
                  <div className="w-24">
                    <FormField label="Tipo doc.">
                      <select value={profileForm.document_type} onChange={e => setProfileForm(p => ({ ...p, document_type: e.target.value }))}
                        className="w-full px-2 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">—</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
                      </select>
                    </FormField>
                  </div>
                  <div className="flex-1">
                    <FormField label="Número">
                      <input type="text" value={profileForm.document} onChange={e => setProfileForm(p => ({ ...p, document: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="000.000.000-00" />
                    </FormField>
                  </div>
                </div>
                <FormField label="Tipo de atuação">
                  <select value={profileForm.business_type} onChange={e => setProfileForm(p => ({ ...p, business_type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Não informado</option>
                    {Object.entries(businessTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </FormField>
                <FormField label="Funcionários">
                  <select value={profileForm.employees} onChange={e => setProfileForm(p => ({ ...p, employees: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Não informado</option>
                    {Object.entries(employeesLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </FormField>
                <FormField label="Faturamento estimado">
                  <select value={profileForm.revenue} onChange={e => setProfileForm(p => ({ ...p, revenue: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Não informado</option>
                    {Object.entries(revenueLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </FormField>
                <button onClick={() => profileMutation.mutate(profileForm)} disabled={profileMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-50 transition-colors">
                  {profileMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar alterações
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {client.full_name  && <InfoRow icon={User}      label="Nome"                value={client.full_name} />}
                {client.email      && <InfoRow icon={Mail}      label="E-mail"              value={client.email} />}
                {client.phone      && <InfoRow icon={Phone}     label="Telefone / WhatsApp" value={client.phone} />}
                {client.document   && <InfoRow icon={FileText}  label={client.document_type || 'Documento'} value={client.document} />}
                {client.business_type && <InfoRow icon={Building2} label="Tipo de Atuação" value={businessTypeLabels[client.business_type] || client.business_type} />}
                {client.employees  && <InfoRow icon={Users}     label="Funcionários"        value={employeesLabels[client.employees] || client.employees} />}
                {client.revenue    && <InfoRow icon={DollarSign} label="Faturamento"        value={revenueLabels[client.revenue] || client.revenue} />}
                {!client.full_name && !client.phone && (
                  <div className="bg-amber-50 ring-1 ring-inset ring-amber-200 text-amber-700 dark:bg-amber-900/20 dark:ring-amber-700/40 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Perfil incompleto — clique em Editar para preencher.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Segmento Comercial */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Segmento Comercial</h3>
            <div className="flex items-center gap-3">
              <select value={client.customer_segment || ''} onChange={e => segmentMutation.mutate(e.target.value || null)}
                disabled={segmentMutation.isPending}
                className="appearance-none px-3 py-1.5 text-sm font-medium border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                {SEGMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {segmentMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Acesso ao Portal — visível para parceiros */}
          {isPartner && <PartnerAccessPanel client={client} queryKey={queryKey} />}

          {/* Tabela de Preço */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Tabela de Preço</h3>
            <div className="flex items-center gap-3">
              <select value={client.price_list_id || ''} onChange={e => priceListMutation.mutate(e.target.value || null)}
                disabled={priceListMutation.isPending}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                <option value="">Preço padrão do catálogo</option>
                {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
              {priceListMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Pedidos */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">
              Pedidos {!loadingOrders && orders.length > 0 && `(${orders.length})`}
            </h3>
            {loadingOrders ? (
              <div className="py-4 flex justify-center"><Loader className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum pedido registrado.</p>
            ) : (
              <div className="space-y-3">
                {orders.map(order => {
                  const si = orderStatusLabels[order.status] || { label: order.status, color: 'bg-muted text-muted-foreground' }
                  return (
                    <div key={order.id} className="bg-muted/40 rounded-xl border border-border overflow-hidden">
                      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border/60 bg-card">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-bold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${si.color}`}>{si.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-extrabold text-foreground">R$ {Number(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="p-2.5 space-y-1.5">
                        {order.order_items.slice(0, 3).map(item => {
                          const imgUrl = Array.isArray(item.catalog_products)
                            ? (item.catalog_products as any)[0]?.main_image
                            : item.catalog_products?.main_image || null
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 bg-card rounded-lg p-2 border border-border/60">
                              {imgUrl
                                ? <img src={imgUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                                : <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-[11px] text-muted-foreground">{item.qty}× R$ {Number(item.unit_price_snapshot).toFixed(2)}</p>
                              </div>
                              <span className="text-[13px] font-bold text-foreground">R$ {Number(item.line_total).toFixed(2)}</span>
                            </div>
                          )
                        })}
                        {order.order_items.length > 3 && (
                          <p className="text-[11px] text-muted-foreground text-center">+{order.order_items.length - 3} item(s)</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Partner Access Panel ─────────────────────────────────────────────────────

interface CredResult { phone: string; created_password: string; partner_name: string }

function PartnerAccessPanel({ client, queryKey }: { client: ClientStats; queryKey: string }) {
  const queryClient = useQueryClient()
  const accessStatus = client.access_status ?? 'not_created'
  const [manualPassword, setManualPassword] = useState('')
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [credResult, setCredResult] = useState<CredResult | null>(null)

  async function invokeAction(action: string, password?: string) {
    const body: Record<string, unknown> = { action, profile_id: client.id }
    if (password) body.password = password
    const data = await callEdgeFunction('admin-partner-credentials', body)
    if (data?.error) throw new Error(data.error)
    return data
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] })

  const createMutation = useMutation({
    mutationFn: () => invokeAction('create', manualPassword || undefined),
    onSuccess: (data) => {
      setCredResult({ phone: data.phone, created_password: data.created_password, partner_name: data.partner_name })
      setManualPassword(''); setShowPasswordInput(false)
      toast.success('Acesso criado com sucesso'); invalidate()
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao criar acesso'),
  })

  const resetMutation = useMutation({
    mutationFn: () => invokeAction('reset_password', manualPassword || undefined),
    onSuccess: (data) => {
      setCredResult({ phone: data.phone, created_password: data.created_password, partner_name: data.partner_name })
      setManualPassword(''); setShowPasswordInput(false)
      toast.success('Senha resetada'); invalidate()
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao resetar senha'),
  })

  const blockMutation = useMutation({
    mutationFn: () => invokeAction('block'),
    onSuccess: () => { toast.success('Acesso bloqueado'); invalidate() },
    onError: (err: any) => toast.error(err.message || 'Erro ao bloquear'),
  })

  const unblockMutation = useMutation({
    mutationFn: () => invokeAction('unblock'),
    onSuccess: () => { toast.success('Acesso desbloqueado'); invalidate() },
    onError: (err: any) => toast.error(err.message || 'Erro ao desbloquear'),
  })

  const isLoading = createMutation.isPending || resetMutation.isPending || blockMutation.isPending || unblockMutation.isPending

  const statusConfig = {
    not_created: { label: 'Sem acesso', classes: 'bg-muted text-muted-foreground ring-border' },
    active:      { label: 'Ativo',      classes: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40' },
    blocked:     { label: 'Bloqueado',  classes: 'bg-red-100 text-red-600 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/40' },
  }
  const statusInfo = statusConfig[accessStatus as keyof typeof statusConfig] ?? statusConfig.not_created

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado`))
  }

  function buildWhatsAppMessage(cred: CredResult) {
    return `Olá, ${cred.partner_name}! 🔑 Seu acesso ao portal Rei dos Cachos foi criado.\n\nLogin: ${cred.phone}\nSenha: ${cred.created_password}\nAcesse em: ${window.location.origin}/login\n\nGuarde esses dados.`
  }

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Acesso ao Portal</h3>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${statusInfo.classes}`}>
          {statusInfo.label}
        </span>
      </div>

      {client.credentials_created_at && (
        <p className="text-[11px] text-muted-foreground mb-1">
          Criado em {new Date(client.credentials_created_at).toLocaleDateString('pt-BR')}
          {client.auth_phone && <> · Login: <span className="font-medium text-foreground">{client.auth_phone}</span></>}
        </p>
      )}
      {client.last_password_reset_at && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Senha resetada em {new Date(client.last_password_reset_at).toLocaleDateString('pt-BR')}
        </p>
      )}

      {(accessStatus === 'not_created' || accessStatus === 'active') && showPasswordInput && (
        <div className="flex items-center gap-2 mb-3">
          <input type="text" placeholder="Senha personalizada (opcional)" value={manualPassword}
            onChange={e => setManualPassword(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:outline-none bg-background text-foreground" />
          <button onClick={() => { setShowPasswordInput(false); setManualPassword('') }} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {accessStatus === 'not_created' && (
          <>
            <button onClick={() => createMutation.mutate()} disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold btn-action rounded-lg disabled:opacity-50 transition-colors">
              {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Criar Acesso
            </button>
            <button onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-accent text-foreground/70 transition-colors">
              Definir senha
            </button>
          </>
        )}
        {accessStatus === 'active' && (
          <>
            <button onClick={() => resetMutation.mutate()} disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold btn-action rounded-lg disabled:opacity-50 transition-colors">
              {resetMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Resetar Senha
            </button>
            <button onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-accent text-foreground/70 transition-colors">
              Definir senha
            </button>
            <button onClick={() => blockMutation.mutate()} disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:border-red-700/40 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors">
              {blockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Bloquear
            </button>
          </>
        )}
        {accessStatus === 'blocked' && (
          <button onClick={() => unblockMutation.mutate()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold btn-action rounded-lg disabled:opacity-50 transition-colors">
            {unblockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            Desbloquear
          </button>
        )}
      </div>

      {credResult && (
        <div className="mt-4 bg-zinc-900 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Credenciais geradas</p>
          {[{ label: 'Login', value: credResult.phone }, { label: 'Senha', value: credResult.created_password }].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-2 bg-zinc-800 rounded-lg px-3 py-2">
              <div>
                <p className="text-[10px] text-zinc-500 leading-none">{label}</p>
                <p className="text-sm font-mono font-bold text-white mt-0.5">{value}</p>
              </div>
              <button onClick={() => copyToClipboard(value, label)} className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => copyToClipboard(buildWhatsAppMessage(credResult), 'Mensagem')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors">
              <Copy className="w-3.5 h-3.5" />Copiar msg WA
            </button>
            <a href={`https://wa.me/${credResult.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(credResult))}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
              <Phone className="w-3.5 h-3.5" />Abrir WhatsApp
            </a>
          </div>
          <button onClick={() => setCredResult(null)} className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors pt-1">
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sistema Tab ──────────────────────────────────────────────────────────────

function SystemTab({
  users,
  stores,
  onRoleChange,
  onPermissionChange,
  isPending,
}: {
  users: SystemUser[]
  stores: StoreOption[]
  onRoleChange: (id: string, role: string, storeId?: string | null) => void
  onPermissionChange: (id: string, key: string, value: boolean) => void
  isPending: boolean
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  }, [users, search])

  const selected = users.find(u => u.id === selectedId) ?? null

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nome ou e-mail..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} usuário{filtered.length !== 1 ? 's' : ''}</p>

        <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome / E-mail</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acesso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último Acesso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {search ? 'Nenhum resultado encontrado.' : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              ) : filtered.map((user, i) => (
                <tr key={user.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? '' : 'bg-surface-alt/30'}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-foreground">{user.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_STYLES[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                    {user.role === 'salao' && user.store_name && (
                      <p className="text-[11px] text-muted-foreground mt-1">{user.store_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelectedId(user.id)}
                      className="text-xs font-medium text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-surface-alt transition-colors">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <SystemUserSidePanel
          user={selected}
          stores={stores}
          onRoleChange={onRoleChange}
          onPermissionChange={onPermissionChange}
          isPending={isPending}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}

function SystemUserSidePanel({
  user,
  stores,
  onRoleChange,
  onPermissionChange,
  isPending,
  onClose,
}: {
  user: SystemUser
  stores: StoreOption[]
  onRoleChange: (id: string, role: string, storeId?: string | null) => void
  onPermissionChange: (id: string, key: string, value: boolean) => void
  isPending: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [nameValue, setNameValue] = useState(user.full_name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [whatsappValue, setWhatsappValue] = useState(user.whatsapp_number ?? '')
  const [editingWhatsapp, setEditingWhatsapp] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.role)
  const [selectedStoreId, setSelectedStoreId] = useState(user.store_id ?? '')

  const initials = (user.full_name || user.email).split(/[\s@]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const roleColor = user.role === 'admin' ? 'bg-purple-700' : user.role === 'administrativo' ? 'bg-blue-700' : 'bg-amber-700'

  const hasRoleChange = selectedRole !== user.role || (selectedRole === 'salao' && selectedStoreId !== (user.store_id ?? ''))

  const nameMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc('admin_update_full_name', {
        p_user_id:   user.id,
        p_full_name: name,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Nome atualizado')
      setEditingName(false)
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  const whatsappMutation = useMutation({
    mutationFn: async (whatsapp: string) => {
      const { error } = await supabase.rpc('admin_set_user_whatsapp', {
        p_user_id:  user.id,
        p_whatsapp: whatsapp,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('WhatsApp atualizado')
      setEditingWhatsapp(false)
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  return (
    <>
      <div className="fixed inset-0 bg-zinc-900/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="border-b border-zinc-200 px-5 py-4 flex items-start gap-3.5 flex-shrink-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${roleColor}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-zinc-900 truncate">{user.full_name || '—'}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
            <span className={`inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${ROLE_STYLES[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Datas */}
          <div className="px-5 py-4 border-b border-zinc-100 flex gap-6">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Criado em</p>
              <p className="text-sm font-medium text-zinc-700">
                {new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            {user.last_sign_in_at && (
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Último acesso</p>
                <p className="text-sm font-medium text-zinc-700">
                  {new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>

          {/* Nome */}
          <div className="px-5 py-4 border-b border-zinc-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Nome</h3>
              {!editingName ? (
                <button onClick={() => { setNameValue(user.full_name ?? ''); setEditingName(true) }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingName(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-50 transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>
            {editingName ? (
              <div className="flex gap-2">
                <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && nameMutation.mutate(nameValue)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  placeholder="Nome completo" autoFocus />
                <button onClick={() => nameMutation.mutate(nameValue)} disabled={nameMutation.isPending}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors">
                  {nameMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-zinc-800">{user.full_name || <span className="text-zinc-400 italic">Não informado</span>}</p>
            )}
          </div>

          {/* WhatsApp — usado pra notificar quando o usuário é responsável por
              um candidato e um contrato é gerado automaticamente (DP). */}
          <div className="px-5 py-4 border-b border-zinc-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">WhatsApp</h3>
              {!editingWhatsapp ? (
                <button onClick={() => { setWhatsappValue(user.whatsapp_number ?? ''); setEditingWhatsapp(true) }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingWhatsapp(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-50 transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>
            {editingWhatsapp ? (
              <div className="flex gap-2">
                <input type="tel" value={whatsappValue} onChange={e => setWhatsappValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && whatsappMutation.mutate(whatsappValue)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  placeholder="(27) 99999-9999" autoFocus />
                <button onClick={() => whatsappMutation.mutate(whatsappValue)} disabled={whatsappMutation.isPending}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors">
                  {whatsappMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-zinc-800">{user.whatsapp_number || <span className="text-zinc-400 italic">Não informado</span>}</p>
            )}
          </div>

          {/* Nível de acesso */}
          <div className="px-5 py-4 border-b border-zinc-200">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Nível de Acesso</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['salao', 'administrativo', 'admin'] as const).map(r => (
                <button key={r} type="button"
                  onClick={() => setSelectedRole(r)}
                  disabled={isPending}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs sm:text-sm font-semibold transition-all disabled:cursor-default ${
                    selectedRole === r
                      ? `${ROLE_STYLES[r]} border-current/30`
                      : 'bg-white text-muted-foreground border-border hover:bg-surface-alt disabled:opacity-50'
                  }`}>
                  {ROLE_ICONS[r]}{ROLE_LABELS[r]}
                </button>
              ))}
            </div>

            {selectedRole === 'salao' && (
              <div className="mt-3">
                <label className="block text-[11px] text-zinc-500 mb-1">Loja vinculada (opcional)</label>
                <p className="text-[11px] text-zinc-400 mb-1">Sem loja, acessa só o módulo de venda.</p>
                <select
                  value={selectedStoreId}
                  onChange={e => setSelectedStoreId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="">Nenhuma (só vendas)</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {hasRoleChange && (
              <button
                type="button"
                onClick={() => { onRoleChange(user.id, selectedRole, selectedRole === 'salao' ? selectedStoreId : null); onClose() }}
                disabled={isPending}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar acesso
              </button>
            )}
          </div>

          {/* Permissões granulares */}
          <div className="px-5 py-4 border-b border-zinc-200">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Permissões</h3>
            <div className="space-y-3">
              {[
                { key: 'can_edit_orders', label: 'Editar pedidos', description: 'Permite alterar itens, vendedor e pagamento de pedidos criados' },
                { key: 'can_manage_rh', label: 'Gerenciar RH', description: 'Acesso às telas de Vagas e Kanban de Candidatos' },
              ].map(({ key, label, description }) => {
                const enabled = !!(user.permissions?.[key])
                return (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800">{label}</p>
                      <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">{description}</p>
                    </div>
                    <button
                      onClick={() => onPermissionChange(user.id, key, !enabled)}
                      disabled={isPending}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 mt-0.5 ${
                        enabled ? 'bg-green-500' : 'bg-zinc-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                        enabled ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div className="text-center py-16">
      <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  )
}

function AccessBadge({ status }: { status: string | null }) {
  if (status === 'active')  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Ativo</span>
  if (status === 'blocked') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Bloqueado</span>
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sem acesso</span>
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 leading-none">{label}</p>
        <p className="text-sm font-medium text-zinc-800 truncate mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

