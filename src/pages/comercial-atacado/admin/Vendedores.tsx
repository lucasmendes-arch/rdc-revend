import { useState } from 'react'
import { formatBRL } from '@/lib/format'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, Plus, UserCheck, Pencil, Trash2, Star, Link2, FileText, Send, CheckCircle2, AlertCircle, Archive, ArchiveRestore } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, Panel, EmptyState, PageLoading, PageTabs } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { DateField } from '@/components/ui/date-field'
import StyledSelect from '@/components/ui/styled-select'

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
  /** NULL = em uso. Arquivado é sempre inativo e nunca padrão (CHECK no banco). */
  archived_at: string | null
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

  const [view, setView] = useState<'ativos' | 'arquivados'>('ativos')

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
      toast.error(`Não foi possível salvar o vendedor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
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
      toast.error(`Não foi possível atualizar o vendedor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
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
      toast.error(`Não foi possível atualizar o vendedor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    },
  })

  // Arquivar tira o vendedor de uso sem perder o histórico de pedidos (excluir
  // zera orders.seller_id). Restaurar devolve como ativo.
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const update = archive
        ? { archived_at: new Date().toISOString(), active: false }
        : { archived_at: null, active: true }
      const { error } = await supabase.from('sellers').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id, archive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      if (archive) {
        toast.success('Vendedor arquivado', {
          description: 'Ele saiu das listas de seleção. Os pedidos dele continuam no histórico.',
          action: { label: 'Desfazer', onClick: () => archiveMutation.mutate({ id, archive: false }) },
        })
      } else {
        toast.success('Vendedor restaurado e ativo')
      }
    },
    onError: (err) => {
      toast.error(`Não foi possível arquivar o vendedor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
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
      toast.error(`Não foi possível excluir o vendedor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
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
      toast.error('Informe o nome do vendedor.')
      return
    }
    const pct = Number(form.commission_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('A comissão deve ficar entre 0 e 100%.')
      return
    }
    const goal = Number(form.monthly_goal)
    if (isNaN(goal) || goal < 0) {
      toast.error('A meta mensal não pode ser negativa.')
      return
    }
    saveMutation.mutate({ id: editingId, payload: { ...form, commission_pct: pct, monthly_goal: goal } })
  }

  const activeSellers = sellers.filter((s) => !s.archived_at)
  const archivedSellers = sellers.filter((s) => !!s.archived_at)
  const visibleSellers = view === 'ativos' ? activeSellers : archivedSellers
  const isArchivedView = view === 'arquivados'

  const linkedUserLabel = (userId: string) => {
    const u = systemUsers.find(x => x.id === userId)
    return u?.full_name || u?.email || 'Vinculado'
  }

  return (
    <AdminLayout>
      <AdminPage
        title="Vendedores"
        description="Gerencie a equipe de vendas e comissões"
        tabs={
          <PageTabs
            items={[
              { key: 'ativos', label: 'Em uso', count: activeSellers.length },
              { key: 'arquivados', label: 'Arquivados', count: archivedSellers.length },
            ]}
            value={view}
            onChange={(k) => setView(k as 'ativos' | 'arquivados')}
          />
        }
        actions={
          <Button onClick={openCreate} aria-label="Novo vendedor">
            <Plus />
            <span className="hidden sm:inline">Novo vendedor</span>
          </Button>
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando vendedores…" />
        ) : isArchivedView && visibleSellers.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Archive}
              title="Nenhum vendedor arquivado"
              description="Arquive quem saiu da equipe: some das listas de seleção, mas os pedidos dele continuam no histórico."
            />
          </Panel>
        ) : visibleSellers.length === 0 ? (
          <Panel>
            <EmptyState
              icon={UserCheck}
              title="Nenhum vendedor cadastrado"
              description="Cadastre a equipe de vendas para atribuir pedidos e calcular comissões."
              action={
                <Button onClick={openCreate}>
                  <Plus />
                  Novo vendedor
                </Button>
              }
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Meta mensal</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-center">Padrão</TableHead>
                  <TableHead className="hidden lg:table-cell">Usuário CRM</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSellers.map((seller) => (
                  <TableRow key={seller.id}>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">{seller.name}</TableCell>
                    <TableCell>
                      {seller.code ? (
                        <span className="px-1.5 py-0.5 rounded-sm bg-muted border border-border text-[12px] font-mono font-medium text-ink-600">
                          {seller.code}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell whitespace-nowrap">
                      {seller.phone || <span className="text-ink-400">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {seller.commission_pct}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell whitespace-nowrap">
                      {seller.monthly_goal > 0 ? (
                        <span className="text-foreground">R$ {seller.monthly_goal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {seller.archived_at ? (
                        <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                          Arquivado em {new Date(seller.archived_at).toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                      <Switch
                        checked={seller.active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: seller.id, active: checked })}
                        title={seller.active ? 'Desativar' : 'Ativar'}
                        aria-label={seller.active ? `Desativar ${seller.name}` : `Ativar ${seller.name}`}
                        className="align-middle"
                      />
                      )}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {seller.archived_at ? (
                        <span className="text-ink-400">—</span>
                      ) : seller.is_default ? (
                        <Badge variant="brand">
                          <Star className="w-3 h-3 fill-current" />
                          Padrão
                        </Badge>
                      ) : (
                        <Button
                          variant="link"
                          size="xs"
                          onClick={() => setDefaultMutation.mutate(seller.id)}
                          disabled={setDefaultMutation.isPending}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Tornar padrão
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {seller.user_id ? (
                        <Badge variant="success">
                          <Link2 className="w-3 h-3" />
                          {linkedUserLabel(seller.user_id)}
                        </Badge>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {!seller.archived_at && (
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(seller)} title="Editar" aria-label="Editar vendedor">
                            <Pencil />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => openReport(seller)} title="Relatório de comissão" aria-label="Relatório de comissão">
                          <FileText />
                        </Button>
                        {seller.archived_at ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => archiveMutation.mutate({ id: seller.id, archive: false })}
                            disabled={archiveMutation.isPending}
                            title="Restaurar"
                            aria-label={`Restaurar ${seller.name}`}
                          >
                            <ArchiveRestore />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => archiveMutation.mutate({ id: seller.id, archive: true })}
                            // O padrão é o fallback de pedido sem vendedor; o banco também bloqueia.
                            disabled={seller.is_default || archiveMutation.isPending}
                            title={seller.is_default ? 'Defina outro vendedor como padrão antes de arquivar' : 'Arquivar'}
                            aria-label={`Arquivar ${seller.name}`}
                          >
                            <Archive />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteConfirm(seller.id)}
                          className="hover:text-danger hover:bg-danger-subtle"
                          title="Excluir"
                          aria-label="Excluir vendedor"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </AdminPage>

      {/* Criar / editar */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">
              {editingId ? 'Editar vendedor' : 'Novo vendedor'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="seller-name" className="field-label">Nome *</Label>
              <Input
                id="seller-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Rebeca Silva"
              />
            </div>

            <div>
              <Label htmlFor="seller-code" className="field-label">
                Código interno
                <span className="text-muted-foreground font-normal ml-1">(apelido único)</span>
              </Label>
              <Input
                id="seller-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="font-mono"
                placeholder="Ex: REBECA"
              />
            </div>

            <div>
              <Label htmlFor="seller-phone" className="field-label">Telefone</Label>
              <Input
                id="seller-phone"
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="seller-pct" className="field-label">Comissão (%)</Label>
                <Input
                  id="seller-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.commission_pct}
                  onChange={(e) => setForm({ ...form, commission_pct: parseFloat(e.target.value) || 0 })}
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="seller-goal" className="field-label">Meta mensal (R$)</Label>
                <Input
                  id="seller-goal"
                  type="number"
                  min="0"
                  step="100"
                  value={form.monthly_goal}
                  onChange={(e) => setForm({ ...form, monthly_goal: parseFloat(e.target.value) || 0 })}
                  className="tabular-nums"
                  placeholder="0 = sem meta"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="seller-email" className="field-label">E-mail</Label>
              <Input
                id="seller-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="vendedor@email.com"
              />
            </div>

            {/* Vínculo com usuário admin — permite resolução automática de "Minhas contas" no CRM */}
            <div>
              <span className="field-label">
                Usuário CRM vinculado
                <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
              </span>
              <StyledSelect
                value={form.linked_user_id}
                onChange={(v) => setForm({ ...form, linked_user_id: v })}
                options={systemUsers.map(u => ({
                  value: u.id,
                  label: `${u.full_name ? `${u.full_name} (${u.email})` : u.email}${u.role === 'admin' ? ' · admin' : ' · salão'}`,
                }))}
                emptyLabel="Sem usuário vinculado"
                placeholder="Sem usuário vinculado"
              />
              <p className="text-[12px] text-muted-foreground mt-1.5">
                Permite que a visão "Minhas contas" no CRM seja resolvida automaticamente para este usuário.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.active}
                  onCheckedChange={(checked) => setForm({ ...form, active: checked === true })}
                />
                <span className="text-[13px] font-medium text-foreground">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.is_default}
                  onCheckedChange={(checked) => setForm({ ...form, is_default: checked === true })}
                />
                <span className="text-[13px] font-medium text-foreground flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-brand-strong" />
                  Vendedor padrão
                </span>
              </label>
            </div>

            {form.is_default && (
              <p className="text-[12px] text-muted-foreground bg-surface border border-border rounded-md px-3 py-2">
                Definir como padrão removerá o padrão do vendedor atual automaticamente.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader className="animate-spin" />}
              {saveMutation.isPending ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar vendedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Excluir vendedor?</DialogTitle>
            <DialogDescription>
              O vendedor será removido e os pedidos dele ficam sem vendedor. Para tirar de uso mantendo o histórico, prefira arquivar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir vendedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relatório de comissão */}
      <Dialog open={!!reportSeller} onOpenChange={(open) => { if (!open) closeReport() }}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)]">
          {reportSeller && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[16px]">Relatório de comissão</DialogTitle>
                <DialogDescription>
                  {reportSeller.name}{reportSeller.code ? ` · ${reportSeller.code}` : ''} · {reportSeller.commission_pct}%
                </DialogDescription>
              </DialogHeader>

              {!reportResult ? (
                <>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="field-label">Data inicial</span>
                        <DateField
                          value={reportStart || null}
                          onChange={v => setReportStart(v ?? '')}
                          max={reportEnd || null}
                        />
                      </div>
                      <div>
                        <span className="field-label">Data final</span>
                        <DateField
                          value={reportEnd || null}
                          onChange={v => setReportEnd(v ?? '')}
                          min={reportStart || null}
                        />
                      </div>
                    </div>

                    <p className="text-[12px] text-muted-foreground bg-surface border border-border rounded-md px-3 py-2">
                      Será gerado um PDF com os pedidos finalizados (pago + concluído) e enviado pelo WhatsApp para o financeiro.
                    </p>

                    {reportError && (
                      <div className="flex items-start gap-2 text-danger bg-danger-subtle border border-danger-border rounded-md px-3 py-2 text-[13px]">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        {reportError}
                      </div>
                    )}
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="secondary" onClick={closeReport}>
                      Cancelar
                    </Button>
                    {/* Verde WhatsApp: exceção de marca documentada */}
                    <Button
                      onClick={sendReport}
                      disabled={reportLoading || !reportStart || !reportEnd}
                      className="bg-success-solid hover:bg-success-solid/90 text-white"
                    >
                      {reportLoading ? <Loader className="animate-spin" /> : <Send />}
                      {reportLoading ? 'Gerando…' : 'Enviar pelo WhatsApp'}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[14px] font-semibold">Relatório enviado</span>
                  </div>

                  <div className="bg-surface border border-border rounded-lg p-4 space-y-2 text-[13px] tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pedidos finalizados</span>
                      <span className="font-medium text-foreground">{reportResult.summary.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor total</span>
                      <span className="font-medium text-foreground">
                        {formatBRL(reportResult.summary.total_value)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 mt-2">
                      <span className="font-medium text-foreground">Comissão ({reportResult.summary.commission_pct}%)</span>
                      <span className="font-semibold text-success">
                        {formatBRL(reportResult.summary.commission_amount)}
                      </span>
                    </div>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="secondary" onClick={closeReport}>
                      Fechar
                    </Button>
                    <Button variant="secondary" asChild>
                      <a href={reportResult.pdf_url} target="_blank" rel="noopener noreferrer">
                        <FileText />
                        Ver PDF
                      </a>
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
