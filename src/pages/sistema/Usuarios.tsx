import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Loader, Plus, ShieldCheck, Store, Users,
  X, Edit2, Check, User, Phone, Mail, FileText, Building2,
  DollarSign, KeyRound, RefreshCw, Lock, Unlock, Copy, Package,
  AlertTriangle, TrendingUp, Briefcase,
} from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { ORDER_STATUS, ORDER_STATUS_SEQUENCE, toneClasses } from '@/lib/design/orderStatus'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, PageTabs, Toolbar, SearchInput, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { formatBRL } from '@/lib/format'

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
  salao: 'bg-brand-subtle text-brand-strong',
  administrativo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}
const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="w-3.5 h-3.5" />,
  salao: <Store className="w-3.5 h-3.5" />,
  administrativo: <Briefcase className="w-3.5 h-3.5" />,
}

const SEGMENT_OPTIONS = [
  { value: '',                label: 'Não classificado' },
  { value: 'network_partner', label: 'Parceiro da rede' },
  { value: 'wholesale_buyer', label: 'Comprador atacado' },
]
// Mesma família de cor do segmentBadge.
const SEGMENT_DOT: Record<string, string> = {
  '': 'bg-ink-300',
  network_partner: 'bg-brand-solid',
  wholesale_buyer: 'bg-teal-500',
}
const segmentBadge = (v: string | null) => {
  if (v === 'network_partner') return 'bg-brand-subtle text-brand-strong'
  if (v === 'wholesale_buyer') return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
  return 'bg-muted text-muted-foreground'
}
const segmentLabel = (v: string | null) =>
  SEGMENT_OPTIONS.find(o => o.value === (v || ''))?.label ?? 'Não classificado'

const businessTypeLabels: Record<string, string> = {
  salao: 'Salão de beleza',
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
// Cor e rótulo vêm de orderStatus.ts — o mesmo status tem a mesma cor em qualquer tela.
const orderStatusLabels: Record<string, { label: string; color: string }> = Object.fromEntries(
  ORDER_STATUS_SEQUENCE.map((s) => {
    const meta = ORDER_STATUS[s]
    const t = toneClasses(meta.tone)
    return [s, { label: meta.label, color: `${t.bg} ${t.text}` }]
  }),
)

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
      toast.success('Usuário criado')
    },
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`),
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
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`),
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
    if (!createForm.email || !createForm.password) { toast.error('E-mail e senha são obrigatórios'); return }
    if (createForm.password.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres'); return }
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
      <AdminPage
        title="Usuários"
        description="Sistema, parceiros e clientes"
        actions={
          activeTab === 'sistema' ? (
            <Button onClick={() => setCreating(true)} aria-label="Novo usuário">
              <Plus />
              <span className="hidden sm:inline">Novo usuário</span>
            </Button>
          ) : activeTab === 'parceiros' ? (
            <Button onClick={() => setCreatingPartner(true)} aria-label="Novo parceiro">
              <Plus />
              <span className="hidden sm:inline">Novo parceiro</span>
            </Button>
          ) : undefined
        }
        tabs={
          <PageTabs<'sistema' | 'parceiros' | 'clientes'>
            items={tabs.map(t => ({ key: t.key, label: t.label, icon: t.icon }))}
            value={activeTab}
            onChange={setActiveTab}
          />
        }
      >
        {activeTab === 'sistema' && (
          isLoading
            ? <PageLoading />
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
      </AdminPage>

      <Dialog open={creatingPartner} onOpenChange={setCreatingPartner}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Novo parceiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="field-label">Nome completo *</label>
              <Input
                type="text"
                value={partnerForm.full_name}
                onChange={e => setPartnerForm({ ...partnerForm, full_name: e.target.value })}
                placeholder="Nome do parceiro"
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">Telefone (WhatsApp) *</label>
              <Input
                type="tel"
                value={partnerForm.phone}
                onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setCreatingPartner(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!partnerForm.full_name.trim()) { toast.error('Nome é obrigatório'); return }
                if (!partnerForm.phone.replace(/\D/g, '')) { toast.error('Telefone é obrigatório'); return }
                createPartnerMutation.mutate(partnerForm)
              }}
              disabled={createPartnerMutation.isPending}
            >
              {createPartnerMutation.isPending ? 'Criando…' : 'Criar parceiro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="field-label">Tipo de acesso</span>
              <RolePicker
                value={createForm.role}
                onChange={r => setCreateForm({ ...createForm, role: r, store_id: r === 'salao' ? createForm.store_id : '' })}
              />
            </div>
            {createForm.role === 'salao' && (
              <div>
                <span className="field-label">Loja vinculada (opcional)</span>
                <p className="text-[12px] text-muted-foreground mb-1.5">Sem loja, o colaborador só acessa o módulo de venda — não o de contagem de estoque.</p>
                <StyledSelect
                  value={createForm.store_id}
                  onChange={(v) => setCreateForm({ ...createForm, store_id: v })}
                  options={stores.map(s => ({ value: s.id, label: s.name }))}
                  emptyLabel="Nenhuma (só vendas)"
                  placeholder="Nenhuma (só vendas)"
                />
              </div>
            )}
            <div>
              <label className="field-label">E-mail *</label>
              <Input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="usuario@email.com" autoFocus />
            </div>
            <div>
              <label className="field-label">Senha *</label>
              <Input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Mínimo 6 caracteres" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Criando…' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}

/** Seletor de papel (3 opções com a cor categórica do papel). */
function RolePicker({ value, onChange, disabled }: { value: string; onChange: (r: 'salao' | 'administrativo' | 'admin') => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(['salao', 'administrativo', 'admin'] as const).map(r => (
        <button key={r} type="button" onClick={() => onChange(r)} disabled={disabled}
          aria-pressed={value === r}
          className={`flex items-center justify-center gap-1.5 h-9 px-2 rounded-md border text-[13px] font-medium transition-colors disabled:cursor-default ${
            value === r
              ? `${ROLE_STYLES[r]} border-current/30`
              : 'bg-card text-ink-600 border-border hover:border-ink-300 hover:text-foreground disabled:opacity-50'
          }`}>
          {ROLE_ICONS[r]}<span className="truncate">{ROLE_LABELS[r]}</span>
        </button>
      ))}
    </div>
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

  if (isLoading) return <PageLoading />

  return (
    <>
      <div className="space-y-4">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome, e-mail ou telefone…"
            className="sm:w-80"
          />
          <span className="text-[12px] text-muted-foreground tabular-nums sm:ml-auto">
            {filtered.length} {showSegment ? 'cliente' : 'parceiro'}{filtered.length !== 1 ? 's' : ''}
          </span>
        </Toolbar>

        <Panel flush className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? 'Nenhum resultado encontrado' : emptyLabel.replace(/\.$/, '')}
              description={search ? 'Tente outro nome, e-mail ou telefone.' : undefined}
            />
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{showSegment ? 'Cliente' : 'Parceiro'}</TableHead>
                  {showSegment && <TableHead>Segmento</TableHead>}
                  <TableHead>Tabela de preço</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Total comprado</TableHead>
                  <TableHead className="text-center">Acesso</TableHead>
                  <TableHead><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{row.full_name || '—'}</p>
                      <p className="text-[12px] text-muted-foreground">{row.email || row.phone || '—'}</p>
                    </TableCell>
                    {showSegment && (
                      <TableCell>
                        <span className={`inline-flex text-[12px] font-medium px-2 py-0.5 rounded-full ${segmentBadge(row.customer_segment)}`}>
                          {segmentLabel(row.customer_segment)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-foreground">
                      {row.price_list_name || <span className="text-muted-foreground">Padrão</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.last_sign_in_at
                        ? new Date(row.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium text-foreground">
                        {row.total_purchased > 0
                          ? `R$ ${Number(row.total_purchased).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                      {row.order_count > 0 && (
                        <p className="text-[12px] text-muted-foreground">{row.order_count} pedido{row.order_count !== 1 ? 's' : ''}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <AccessBadge status={row.access_status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={() => setSelectedId(row.id)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
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
      // catalog_products é FK N:1: o PostgREST devolve objeto, mas sem tipos gerados o client infere array
      return (data || []) as unknown as ClientOrder[]
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
      <div className="fixed inset-0 bg-ink-950/45 z-40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-card z-50 shadow-xl flex flex-col border-l border-border">

        {/* Header */}
        <div className="border-b border-border px-5 py-4 flex items-start gap-3.5 flex-shrink-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-[13px] flex-shrink-0 ${isPartner ? 'bg-brand-subtle text-brand-strong' : 'bg-muted text-ink-600'}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-semibold text-foreground truncate">{client.full_name || 'Cliente'}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{client.email || client.phone || '—'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${segmentBadge(client.customer_segment)}`}>
                {segmentLabel(client.customer_segment)}
              </span>
              <AccessBadge status={client.access_status} />
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="flex-shrink-0 -mr-1.5 -mt-1"><X /></Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Stats strip */}
          {(client.total_purchased > 0 || client.last_sign_in_at) && (
            <div className="px-5 py-3 border-b border-border flex gap-6">
              {client.total_purchased > 0 && (
                <div>
                  <p className="text-[12px] text-muted-foreground">Total comprado</p>
                  <p className="text-[14px] font-semibold text-foreground tabular-nums">
                    R$ {Number(client.total_purchased).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    <span className="text-[12px] font-normal text-muted-foreground ml-1">({client.order_count} pedidos)</span>
                  </p>
                </div>
              )}
              {client.last_sign_in_at && (
                <div>
                  <p className="text-[12px] text-muted-foreground">Último acesso</p>
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
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Dados do cadastro</h3>
              {!editingProfile ? (
                <button onClick={() => {
                  setProfileForm({ full_name: client.full_name ?? '', phone: client.phone ?? '', document_type: client.document_type ?? '', document: client.document ?? '', business_type: client.business_type ?? '', employees: client.employees ?? '', revenue: client.revenue ?? '' })
                  setEditingProfile(true)
                }} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-600 bg-card hover:bg-muted hover:text-foreground border border-border transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingProfile(false)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-3">
                <FormField label="Nome completo">
                  <input type="text" value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors" autoFocus />
                </FormField>
                <FormField label="WhatsApp / Telefone">
                  <input type="text" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors"
                    placeholder="Ex: 5527999990000" />
                </FormField>
                <div className="flex gap-2">
                  <div className="w-24">
                    <FormField label="Tipo doc.">
                      <StyledSelect
                        value={profileForm.document_type}
                        onChange={(v) => setProfileForm(p => ({ ...p, document_type: v }))}
                        options={[{ value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' }]}
                        emptyLabel="—"
                        placeholder="—"
                        className="px-2"
                      />
                    </FormField>
                  </div>
                  <div className="flex-1">
                    <FormField label="Número">
                      <input type="text" value={profileForm.document} onChange={e => setProfileForm(p => ({ ...p, document: e.target.value }))}
                        className="w-full h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors"
                        placeholder="000.000.000-00" />
                    </FormField>
                  </div>
                </div>
                <FormField label="Tipo de atuação">
                  <StyledSelect
                    value={profileForm.business_type}
                    onChange={(v) => setProfileForm(p => ({ ...p, business_type: v }))}
                    options={Object.entries(businessTypeLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </FormField>
                <FormField label="Funcionários">
                  <StyledSelect
                    value={profileForm.employees}
                    onChange={(v) => setProfileForm(p => ({ ...p, employees: v }))}
                    options={Object.entries(employeesLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </FormField>
                <FormField label="Faturamento estimado">
                  <StyledSelect
                    value={profileForm.revenue}
                    onChange={(v) => setProfileForm(p => ({ ...p, revenue: v }))}
                    options={Object.entries(revenueLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </FormField>
                <button onClick={() => profileMutation.mutate(profileForm)} disabled={profileMutation.isPending}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md btn-primary text-sm font-medium disabled:opacity-45 transition-colors">
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
                {client.business_type && <InfoRow icon={Building2} label="Tipo de atuação" value={businessTypeLabels[client.business_type] || client.business_type} />}
                {client.employees  && <InfoRow icon={Users}     label="Funcionários"        value={employeesLabels[client.employees] || client.employees} />}
                {client.revenue    && <InfoRow icon={DollarSign} label="Faturamento"        value={revenueLabels[client.revenue] || client.revenue} />}
                {!client.full_name && !client.phone && (
                  <div className="bg-warning-subtle border border-warning-border text-warning p-3 rounded-lg text-[13px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Perfil incompleto — clique em Editar para preencher.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Segmento Comercial */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight mb-3">Segmento comercial</h3>
            <div className="flex items-center gap-3">
              <StyledSelect
                variant="inline"
                value={client.customer_segment || ''}
                onChange={(v) => segmentMutation.mutate(v || null)}
                disabled={segmentMutation.isPending}
                options={SEGMENT_OPTIONS.map(o => ({ ...o, dotClassName: SEGMENT_DOT[o.value] }))}
                searchable={false}
                className="font-medium"
              />
              {segmentMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Acesso ao Portal — visível para parceiros */}
          {isPartner && <PartnerAccessPanel client={client} queryKey={queryKey} />}

          {/* Tabela de Preço */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight mb-3">Tabela de preço</h3>
            <div className="flex items-center gap-3">
              <StyledSelect
                variant="inline"
                value={client.price_list_id || ''}
                onChange={(v) => priceListMutation.mutate(v || null)}
                disabled={priceListMutation.isPending}
                options={priceLists.map(pl => ({ value: pl.id, label: pl.name }))}
                emptyLabel="Preço padrão do catálogo"
                placeholder="Preço padrão do catálogo"
              />
              {priceListMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Pedidos */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight mb-3.5">
              Pedidos {!loadingOrders && orders.length > 0 && `(${orders.length})`}
            </h3>
            {loadingOrders ? (
              <div className="py-4 flex justify-center"><Loader className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : orders.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nenhum pedido registrado.</p>
            ) : (
              <div className="space-y-3">
                {orders.map(order => {
                  const si = orderStatusLabels[order.status] || { label: order.status, color: 'bg-muted text-muted-foreground' }
                  return (
                    <div key={order.id} className="bg-surface rounded-lg border border-border overflow-hidden">
                      <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 border-b border-border bg-card">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-mono font-medium text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`text-[11.5px] font-medium px-2 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-semibold text-foreground tabular-nums">{formatBRL(Number(order.total))}</p>
                          <p className="text-[12px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="p-2.5 space-y-1.5">
                        {order.order_items.slice(0, 3).map(item => {
                          const imgUrl = Array.isArray(item.catalog_products)
                            ? (item.catalog_products as any)[0]?.main_image
                            : item.catalog_products?.main_image || null
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 bg-card rounded-md p-2 border border-border">
                              {imgUrl
                                ? <img src={imgUrl} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
                                : <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Package className="w-4 h-4 text-ink-400" /></div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-[12px] text-muted-foreground tabular-nums">{item.qty}× {formatBRL(Number(item.unit_price_snapshot))}</p>
                              </div>
                              <span className="text-[13px] font-semibold text-foreground tabular-nums">{formatBRL(Number(item.line_total))}</span>
                            </div>
                          )
                        })}
                        {order.order_items.length > 3 && (
                          <p className="text-[12px] text-muted-foreground text-center">+{order.order_items.length - 3} item(s)</p>
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
    active:      { label: 'Ativo',      classes: 'bg-success-subtle text-success ring-success-border' },
    blocked:     { label: 'Bloqueado',  classes: 'bg-danger-subtle text-danger ring-danger-border' },
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
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Acesso ao portal</h3>
        <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${statusInfo.classes}`}>
          {statusInfo.label}
        </span>
      </div>

      {client.credentials_created_at && (
        <p className="text-[12px] text-muted-foreground mb-1">
          Criado em {new Date(client.credentials_created_at).toLocaleDateString('pt-BR')}
          {client.auth_phone && <> · Login: <span className="font-medium text-foreground">{client.auth_phone}</span></>}
        </p>
      )}
      {client.last_password_reset_at && (
        <p className="text-[12px] text-muted-foreground mb-3">
          Senha resetada em {new Date(client.last_password_reset_at).toLocaleDateString('pt-BR')}
        </p>
      )}

      {(accessStatus === 'not_created' || accessStatus === 'active') && showPasswordInput && (
        <div className="flex items-center gap-2 mb-3">
          <input type="text" placeholder="Senha personalizada (opcional)" value={manualPassword}
            onChange={e => setManualPassword(e.target.value)}
            className="flex-1 min-w-0 h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors" />
          <button onClick={() => { setShowPasswordInput(false); setManualPassword('') }} aria-label="Cancelar senha personalizada" className="text-ink-400 hover:text-foreground p-1 rounded-sm hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {accessStatus === 'not_created' && (
          <>
            <button onClick={() => createMutation.mutate()} disabled={isLoading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-primary rounded-md disabled:opacity-45 transition-colors">
              {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Criar acesso
            </button>
            <button onClick={() => setShowPasswordInput(v => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-secondary rounded-md transition-colors">
              Definir senha
            </button>
          </>
        )}
        {accessStatus === 'active' && (
          <>
            <button onClick={() => resetMutation.mutate()} disabled={isLoading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-primary rounded-md disabled:opacity-45 transition-colors">
              {resetMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Resetar senha
            </button>
            <button onClick={() => setShowPasswordInput(v => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-secondary rounded-md transition-colors">
              Definir senha
            </button>
            <button onClick={() => blockMutation.mutate()} disabled={isLoading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium border border-danger-border text-danger bg-card rounded-md hover:bg-danger-subtle disabled:opacity-45 transition-colors">
              {blockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Bloquear
            </button>
          </>
        )}
        {accessStatus === 'blocked' && (
          <button onClick={() => unblockMutation.mutate()} disabled={isLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-primary rounded-md disabled:opacity-45 transition-colors">
            {unblockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            Desbloquear
          </button>
        )}
      </div>

      {credResult && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4 space-y-3">
          <p className="text-[13px] font-semibold text-foreground">Credenciais geradas</p>
          {[{ label: 'Login', value: credResult.phone }, { label: 'Senha', value: credResult.created_password }].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-3 py-2">
              <div>
                <p className="text-[12px] text-muted-foreground leading-none">{label}</p>
                <p className="text-sm font-mono font-medium text-foreground mt-1">{value}</p>
              </div>
              <button onClick={() => copyToClipboard(value, label)} aria-label={`Copiar ${label.toLowerCase()}`} className="p-1.5 rounded-md hover:bg-muted text-ink-400 hover:text-foreground transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => copyToClipboard(buildWhatsAppMessage(credResult), 'Mensagem')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-medium btn-secondary rounded-md transition-colors">
              <Copy className="w-3.5 h-3.5" />Copiar mensagem
            </button>
            <a href={`https://wa.me/${credResult.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(credResult))}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors">
              <Phone className="w-3.5 h-3.5" />Abrir WhatsApp
            </a>
          </div>
          <button onClick={() => setCredResult(null)} className="w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors pt-1">
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
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome ou e-mail…"
            className="sm:w-80"
          />
          <span className="text-[12px] text-muted-foreground tabular-nums sm:ml-auto">
            {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
          </span>
        </Toolbar>

        <Panel flush className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? 'Nenhum resultado encontrado' : 'Nenhum usuário cadastrado'}
              description={search ? 'Tente outro nome ou e-mail.' : undefined}
            />
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nome / e-mail</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{user.full_name || '—'}</p>
                      <p className="text-[12px] text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex text-[12px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLES[user.role] ?? 'bg-muted text-ink-600'}`}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                      {user.role === 'salao' && user.store_name && (
                        <p className="text-[12px] text-muted-foreground mt-1">{user.store_name}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={() => setSelectedId(user.id)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
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
  const roleColor = ROLE_STYLES[user.role] ?? 'bg-muted text-ink-600'

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
      <div className="fixed inset-0 bg-ink-950/45 z-40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-card z-50 shadow-xl flex flex-col border-l border-border">

        {/* Header */}
        <div className="border-b border-border px-5 py-4 flex items-start gap-3.5 flex-shrink-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-[13px] flex-shrink-0 ${roleColor}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-semibold text-foreground truncate">{user.full_name || '—'}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{user.email}</p>
            <span className={`inline-flex mt-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLES[user.role] ?? 'bg-muted text-ink-600'}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="flex-shrink-0 -mr-1.5 -mt-1"><X /></Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Datas */}
          <div className="px-5 py-4 border-b border-border flex gap-6">
            <div>
              <p className="text-[12px] text-muted-foreground">Criado em</p>
              <p className="text-[13.5px] font-medium text-foreground">
                {new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            {user.last_sign_in_at && (
              <div>
                <p className="text-[12px] text-muted-foreground">Último acesso</p>
                <p className="text-[13.5px] font-medium text-foreground">
                  {new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>

          {/* Nome */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Nome</h3>
              {!editingName ? (
                <button onClick={() => { setNameValue(user.full_name ?? ''); setEditingName(true) }}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-600 bg-card hover:bg-muted hover:text-foreground border border-border transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingName(false)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>
            {editingName ? (
              <div className="flex gap-2">
                <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && nameMutation.mutate(nameValue)}
                  className="flex-1 min-w-0 h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors"
                  placeholder="Nome completo" autoFocus />
                <button onClick={() => nameMutation.mutate(nameValue)} disabled={nameMutation.isPending}
                  aria-label="Salvar" className="btn-primary h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md disabled:opacity-45 transition-colors">
                  {nameMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-foreground">{user.full_name || <span className="text-muted-foreground">Não informado</span>}</p>
            )}
          </div>

          {/* WhatsApp — usado pra notificar quando o usuário é responsável por
              um candidato e um contrato é gerado automaticamente (DP). */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">WhatsApp</h3>
              {!editingWhatsapp ? (
                <button onClick={() => { setWhatsappValue(user.whatsapp_number ?? ''); setEditingWhatsapp(true) }}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-600 bg-card hover:bg-muted hover:text-foreground border border-border transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />Editar
                </button>
              ) : (
                <button onClick={() => setEditingWhatsapp(false)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[12px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
              )}
            </div>
            {editingWhatsapp ? (
              <div className="flex gap-2">
                <input type="tel" value={whatsappValue} onChange={e => setWhatsappValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && whatsappMutation.mutate(whatsappValue)}
                  className="flex-1 min-w-0 h-9 px-3 text-base md:text-sm rounded-md border border-input bg-background text-foreground hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors"
                  placeholder="(27) 99999-9999" autoFocus />
                <button onClick={() => whatsappMutation.mutate(whatsappValue)} disabled={whatsappMutation.isPending}
                  aria-label="Salvar" className="btn-primary h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md disabled:opacity-45 transition-colors">
                  {whatsappMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-foreground">{user.whatsapp_number || <span className="text-muted-foreground">Não informado</span>}</p>
            )}
          </div>

          {/* Nível de acesso */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight mb-3">Nível de acesso</h3>
            <RolePicker value={selectedRole} onChange={setSelectedRole} disabled={isPending} />

            {selectedRole === 'salao' && (
              <div className="mt-3">
                <span className="field-label">Loja vinculada (opcional)</span>
                <p className="text-[12px] text-muted-foreground mb-1.5">Sem loja, acessa só o módulo de venda.</p>
                <StyledSelect
                  value={selectedStoreId}
                  onChange={setSelectedStoreId}
                  options={stores.map(s => ({ value: s.id, label: s.name }))}
                  emptyLabel="Nenhuma (só vendas)"
                  placeholder="Nenhuma (só vendas)"
                  className="bg-card"
                />
              </div>
            )}

            {hasRoleChange && (
              <button
                type="button"
                onClick={() => { onRoleChange(user.id, selectedRole, selectedRole === 'salao' ? selectedStoreId : null); onClose() }}
                disabled={isPending}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-md btn-primary text-sm font-medium disabled:opacity-45 transition-colors"
              >
                {isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar acesso
              </button>
            )}
          </div>

          {/* Permissões granulares */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight mb-3">Permissões</h3>
            <div className="space-y-3">
              {[
                { key: 'can_edit_orders', label: 'Editar pedidos', description: 'Permite alterar itens, vendedor e pagamento de pedidos criados' },
                { key: 'can_manage_rh', label: 'Gerenciar RH', description: 'Acesso às telas de Vagas e Kanban de Candidatos' },
              ].map(({ key, label, description }) => {
                const enabled = !!(user.permissions?.[key])
                return (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{description}</p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => onPermissionChange(user.id, key, v)}
                      disabled={isPending}
                      aria-label={label}
                      className="mt-0.5"
                    />
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

function AccessBadge({ status }: { status: string | null }) {
  if (status === 'active')  return <Badge variant="success">Ativo</Badge>
  if (status === 'blocked') return <Badge variant="danger">Bloqueado</Badge>
  return <Badge variant="neutral">Sem acesso</Badge>
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-ink-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground leading-none">{label}</p>
        <p className="text-[13.5px] font-medium text-foreground truncate mt-1">{value}</p>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
