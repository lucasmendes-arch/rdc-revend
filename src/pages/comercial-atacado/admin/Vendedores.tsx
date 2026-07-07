import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, Plus, UserCheck, Pencil, Trash2, Star, Link2, FileText, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface Seller {
  id: string
  name: string
  code: string | null
  email: string | null
  phone: string | null
  commission_pct: number
  monthly_goal: number
  is_default: boolean
  active: boolean
  created_at: string
  user_id: string | null
}

interface SystemUser {
  id: string
  role: string
  full_name: string | null
  email: string
}

const EMPTY_FORM = {
  name: '',
  code: '',
  email: '',
  phone: '',
  commission_pct: 0,
  monthly_goal: 0,
  is_default: false,
  active: true,
  linked_user_id: '',  // UUID do usuário Supabase vinculado ('' = sem vínculo)
}

type SellerForm = typeof EMPTY_FORM

export default function AdminVendedores() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SellerForm>(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Commission report modal
  const [reportSeller, setReportSeller] = useState<Seller | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [reportStart, setReportStart] = useState(firstOfMonth)
  const [reportEnd, setReportEnd] = useState(today)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportResult, setReportResult] = useState<{ pdf_url: string; summary: { total_orders: number; total_value: number; commission_pct: number; commission_amount: number } } | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  function openReport(seller: Seller) {
    setReportSeller(seller)
    setReportStart(firstOfMonth)
    setReportEnd(today)
    setReportResult(null)
    setReportError(null)
  }

  function closeReport() {
    setReportSeller(null)
    setReportResult(null)
    setReportError(null)
  }

  async function sendReport() {
    if (!reportSeller) return
    setReportLoading(true)
    setReportError(null)
    setReportResult(null)
    try {
      const data = await callEdgeFunction('send-seller-commission-report', {
        seller_id: reportSeller.id,
        start_date: reportStart,
        end_date: reportEnd,
      })
      setReportResult(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setReportError(msg.includes('404') || msg.includes('Nenhum pedido')
        ? 'Nenhum pedido finalizado encontrado para este vendedor no período.'
        : msg)
    } finally {
      setReportLoading(false)
    }
  }

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as Seller[]
    },
    staleTime: 30 * 1000,
  })

  // Usuários de sistema (admin/salao) para o vínculo CRM
  const { data: systemUsers = [] } = useQuery({
    queryKey: ['system-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_system_users')
      if (error) throw error
      return (data || []) as SystemUser[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: SellerForm }) => {
      const data = {
        name: payload.name.trim(),
        code: payload.code.trim() || null,
        email: payload.email.trim() || null,
        phone: payload.phone.trim() || null,
        commission_pct: payload.commission_pct,
        monthly_goal: payload.monthly_goal,
        is_default: payload.is_default,
        active: payload.active,
        user_id: payload.linked_user_id || null,
      }
      if (id) {
        const { error } = await supabase.from('sellers').update(data).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sellers').insert(data)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      closeModal()
    },
    onError: (err) => {
      alert(`Erro ao salvar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sellers')
        .update({ is_default: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('sellers').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sellers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      setDeleteConfirm(null)
    },
    onError: (err) => {
      alert(`Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(seller: Seller) {
    setEditingId(seller.id)
    setForm({
      name: seller.name,
      code: seller.code ?? '',
      email: seller.email ?? '',
      phone: seller.phone ?? '',
      commission_pct: seller.commission_pct,
      monthly_goal: seller.monthly_goal,
      is_default: seller.is_default,
      active: seller.active,
      linked_user_id: seller.user_id ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSave() {
    if (!form.name.trim()) {
      alert('Nome é obrigatório')
      return
    }
    const pct = Number(form.commission_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      alert('Comissão deve ser entre 0 e 100')
      return
    }
    const goal = Number(form.monthly_goal)
    if (isNaN(goal) || goal < 0) {
      alert('Meta mensal deve ser >= 0')
      return
    }
    saveMutation.mutate({ id: editingId, payload: { ...form, commission_pct: pct, monthly_goal: goal } })
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Vendedores</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie a equipe de vendas e comissões</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Vendedor</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando vendedores...</p>
          </div>
        ) : sellers.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum vendedor cadastrado.</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Vendedor" para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Código</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden md:table-cell">Telefone</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Comissão</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground hidden sm:table-cell">Meta mensal</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Ativo</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Padrão</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden lg:table-cell">Usuário CRM</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller, index) => (
                    <tr key={seller.id} className={`border-b border-border/40 last:border-0 ${index % 2 === 0 ? '' : 'bg-muted/30'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{seller.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {seller.code ? (
                          <span className="px-2 py-0.5 rounded-md bg-surface-alt text-xs font-mono font-semibold">
                            {seller.code}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {seller.phone || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="font-medium text-foreground">{seller.commission_pct}%</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center hidden sm:table-cell">
                        {seller.monthly_goal > 0 ? (
                          <span className="font-medium text-foreground">R$ {seller.monthly_goal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: seller.id, active: !seller.active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            seller.active ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                          }`}
                          title={seller.active ? 'Desativar' : 'Ativar'}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              seller.active ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {seller.is_default ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold dark:bg-amber-900/30 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                            Padrão
                          </span>
                        ) : (
                          <button
                            onClick={() => setDefaultMutation.mutate(seller.id)}
                            disabled={setDefaultMutation.isPending}
                            className="text-xs text-muted-foreground hover:text-amber-600 hover:underline transition-colors disabled:opacity-50"
                          >
                            Tornar padrão
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {seller.user_id ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/40">
                            <Link2 className="w-3 h-3" />
                            {systemUsers.find(u => u.id === seller.user_id)?.full_name ||
                             systemUsers.find(u => u.id === seller.user_id)?.email ||
                             'Vinculado'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(seller)}
                            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openReport(seller)}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 transition-colors text-muted-foreground hover:text-emerald-600"
                            title="Relatório de comissão"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(seller.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                            title="Deletar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {editingId ? 'Editar Vendedor' : 'Novo Vendedor'}
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Rebeca Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Código interno
                  <span className="text-muted-foreground font-normal ml-1">(apelido único)</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder="Ex: REBECA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Comissão %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.commission_pct}
                    onChange={(e) => setForm({ ...form, commission_pct: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Meta mensal R$</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.monthly_goal}
                    onChange={(e) => setForm({ ...form, monthly_goal: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="0 = sem meta"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="vendedor@email.com"
                />
              </div>

              {/* Vínculo com usuário admin — permite resolução automática de "Minhas contas" no CRM */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Usuário CRM vinculado
                  <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                </label>
                <select
                  value={form.linked_user_id}
                  onChange={e => setForm({ ...form, linked_user_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                >
                  <option value="">— Sem usuário vinculado —</option>
                  {systemUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                      {u.role === 'admin' ? ' · admin' : ' · salao'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Permite que a view "Minhas contas" no CRM seja resolvida automaticamente para este usuário.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-green-600"
                    />
                    <span className="text-sm font-medium text-foreground">Ativo</span>
                  </label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-amber-500"
                  />
                  <span className="text-sm font-medium text-foreground flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    Vendedor padrão
                  </span>
                </label>
              </div>

              {form.is_default && (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  Definir como padrão removerá o padrão do vendedor atual automaticamente.
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar Vendedor'}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Confirmar exclusão</h2>
            <p className="text-sm text-muted-foreground mb-5">
              O vendedor será removido. Pedidos existentes associados a ele ficarão com vendedor em branco (não serão deletados).
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Deletar'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Commission Report Modal */}
      {reportSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeReport} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Relatório de Comissão</h2>
                <p className="text-sm text-muted-foreground">{reportSeller.name}{reportSeller.code ? ` · ${reportSeller.code}` : ''} · {reportSeller.commission_pct}%</p>
              </div>
            </div>

            {!reportResult ? (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Data inicial</label>
                      <input
                        type="date"
                        value={reportStart}
                        onChange={e => setReportStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Data final</label>
                      <input
                        type="date"
                        value={reportEnd}
                        onChange={e => setReportEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    Será gerado um PDF com os pedidos finalizados (pago + concluído) e enviado via WhatsApp para o financeiro.
                  </p>

                  {reportError && (
                    <div className="flex items-start gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {reportError}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={sendReport}
                    disabled={reportLoading || !reportStart || !reportEnd}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-60 transition-colors"
                  >
                    {reportLoading ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {reportLoading ? 'Gerando...' : 'Enviar via WhatsApp'}
                  </button>
                  <button
                    onClick={closeReport}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-emerald-600 mb-4">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Relatório enviado!</span>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 space-y-2 mb-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pedidos finalizados</span>
                    <span className="font-medium text-foreground">{reportResult.summary.total_orders}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor total</span>
                    <span className="font-medium text-foreground">
                      {reportResult.summary.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">Comissão ({reportResult.summary.commission_pct}%)</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {reportResult.summary.commission_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <a
                    href={reportResult.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    Ver PDF
                  </a>
                  <button
                    onClick={closeReport}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
