import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Tag, Hash, Percent, RefreshCw, Power, PowerOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { DateField } from '@/components/ui/date-field';
import type { StoreSettings, Coupon } from '@/types/marketing';
import StyledSelect from '@/components/ui/styled-select';
import { AdminPage, Panel, EmptyState } from '@/components/admin/ui/AdminPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const Marketing = () => {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [minCartValue, setMinCartValue] = useState<string>('');

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'percent' as 'fixed' | 'percent' | 'free_shipping' | 'shipping_percent',
    discount_value: '',
    usage_limit: '',
    expires_at: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Store Settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('store_settings')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
      
      if (settingsData) {
        setSettings(settingsData);
        setMinCartValue(settingsData.min_cart_value.toString());
      }

      // 2. Fetch Coupons
      const { data: couponsData, error: couponsError } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (couponsError) throw couponsError;
      setCoupons(couponsData || []);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao carregar dados: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    setSavingSettings(true);
    try {
      const val = parseFloat(minCartValue);
      if (isNaN(val) || val < 0) throw new Error('Valor inválido');

      const { error } = await supabase
        .from('store_settings')
        .upsert({ id: 1, min_cart_value: val });
      
      if (error) throw error;
      toast.success('Configuração salva');
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao salvar: ' + message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCoupon(true);
    try {
      if (!newCoupon.code || (newCoupon.discount_type !== 'free_shipping' && !newCoupon.discount_value)) throw new Error('Preencha os campos obrigatórios');

      const { error } = await supabase
        .from('coupons')
        .insert({
          code: newCoupon.code.toUpperCase().trim(),
          discount_type: newCoupon.discount_type,
          discount_value: parseFloat(newCoupon.discount_value) || 0,
          usage_limit: newCoupon.usage_limit ? parseInt(newCoupon.usage_limit) : null,
          expires_at: newCoupon.expires_at || null,
          is_active: true
        });

      if (error) throw error;
      
      toast.success('Cupom criado');
      setNewCoupon({ code: '', discount_type: 'percent', discount_value: '', usage_limit: '', expires_at: '' });
      await fetchData(); // Force re-fetch to update list
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao criar cupom: ' + message);
    } finally {
      setCreatingCoupon(false);
    }
  };

  const toggleCouponStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      toast.success(currentStatus ? 'Cupom desativado' : 'Cupom ativado');
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao atualizar status: ' + message);
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cupom?')) return;
    try {
      const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Cupom excluído');
      setCoupons(prev => prev.filter(c => c.id !== id));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao excluir: ' + message);
    }
  };

  // expires_at pode vir como data pura (YYYY-MM-DD): sem o horário, o Date
  // interpreta em UTC e mostra o dia anterior no fuso de Brasília.
  const formatExpiry = (v: string) =>
    new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('pt-BR');

  const inputIconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none';

  return (
    <AdminLayout>
      <AdminPage
        title="Marketing"
        description="Cupons e regras de pedido da loja"
        width="default"
        actions={
          <Button variant="secondary" size="icon" onClick={fetchData} aria-label="Atualizar dados">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Configurações da loja */}
          <section className="lg:col-span-1 space-y-4">
            <Panel title="Configurações de pedido">
              <div className="space-y-4">
                <div>
                  <label className="field-label" htmlFor="min-cart-value">Valor mínimo do pedido (atacado)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px] pointer-events-none">R$</span>
                    <Input
                      id="min-cart-value"
                      type="number"
                      step="0.01"
                      value={minCartValue}
                      onChange={(e) => setMinCartValue(e.target.value)}
                      className="pl-9 tabular-nums"
                      placeholder="500.00"
                    />
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    Clientes não conseguem finalizar pedidos abaixo deste valor no catálogo.
                  </p>
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleUpdateSettings}
                  disabled={savingSettings || loading}
                >
                  {savingSettings ? <RefreshCw className="animate-spin" /> : <Save />}
                  Salvar configuração
                </Button>
              </div>
            </Panel>

            <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <h3 className="text-[14px] font-semibold text-foreground mb-1">Dica</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Valores mínimos de pedido ajudam a garantir a rentabilidade no atacado. Experimente baixar o mínimo em feriados para aumentar o volume de pedidos.
              </p>
            </div>
          </section>

          {/* Cupons */}
          <section className="lg:col-span-2 space-y-4">
            <Panel title="Novo cupom">
              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="field-label">Código do cupom</label>
                  <div className="relative">
                    <Tag className={inputIconClass} />
                    <Input
                      type="text"
                      value={newCoupon.code}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="EX: BEMVINDO10"
                      className="pl-9 font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">Tipo</label>
                  <StyledSelect
                    value={newCoupon.discount_type}
                    onChange={(v) => setNewCoupon(prev => ({ ...prev, discount_type: v as 'fixed' | 'percent' | 'free_shipping' | 'shipping_percent' }))}
                    options={[
                      { value: 'percent', label: 'Porcentagem (%)' },
                      { value: 'fixed', label: 'Valor fixo (R$)' },
                      { value: 'free_shipping', label: 'Frete grátis' },
                      { value: 'shipping_percent', label: '% de desconto no frete' },
                    ]}
                  />
                </div>

                <div>
                  <label className="field-label">Valor</label>
                  <div className="relative">
                    {(newCoupon.discount_type === 'percent' || newCoupon.discount_type === 'shipping_percent') ? (
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                    ) : (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px] pointer-events-none">R$</span>
                    )}
                    <Input
                      type="number"
                      value={newCoupon.discount_type === 'free_shipping' ? '0' : newCoupon.discount_value}
                      disabled={newCoupon.discount_type === 'free_shipping'}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_value: e.target.value }))}
                      placeholder={newCoupon.discount_type === 'shipping_percent' ? '50' : '10'}
                      className={`tabular-nums ${(newCoupon.discount_type === 'percent' || newCoupon.discount_type === 'shipping_percent') ? 'pr-9' : 'pl-9'}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">Validade (opcional)</label>
                  <DateField
                    value={newCoupon.expires_at || null}
                    onChange={(v) => setNewCoupon(prev => ({ ...prev, expires_at: v ?? '' }))}
                    min={new Date().toISOString().slice(0, 10)}
                    placeholder="Sem validade"
                    className="w-full h-9 flex items-center gap-2 px-3 rounded-md border border-input bg-background text-foreground text-[13.5px] hover:border-ink-300 transition-colors"
                  />
                </div>

                <div>
                  <label className="field-label">Limite de usos</label>
                  <div className="relative">
                    <Hash className={inputIconClass} />
                    <Input
                      type="number"
                      value={newCoupon.usage_limit}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, usage_limit: e.target.value }))}
                      placeholder="Ilimitado"
                      className="pl-9 tabular-nums"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <Button type="submit" disabled={creatingCoupon} className="w-full">
                    {creatingCoupon ? <RefreshCw className="animate-spin" /> : <Plus />}
                    Criar cupom
                  </Button>
                </div>
              </form>
            </Panel>

            <Panel title="Cupons" flush className="overflow-hidden">
              {coupons.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="Nenhum cupom cadastrado"
                  description="Crie o primeiro cupom no formulário acima."
                />
              ) : (
                <Table className="min-w-[620px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Código</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead className="text-right">Usos</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id} className={!coupon.is_active ? 'text-muted-foreground' : ''}>
                        <TableCell>
                          <span className="px-1.5 py-0.5 rounded-sm bg-muted text-foreground font-mono font-medium text-[12px] uppercase border border-border">
                            {coupon.code}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                          {coupon.discount_type === 'fixed' ? `R$ ${coupon.discount_value.toFixed(2)}` :
                           coupon.discount_type === 'percent' ? `${coupon.discount_value}%` :
                           coupon.discount_type === 'shipping_percent' ? `${coupon.discount_value}% no frete` : 'Frete grátis'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-medium text-foreground">{coupon.used_count}</span>
                            {coupon.usage_limit && (
                              <span className="text-[12px] text-muted-foreground">de {coupon.usage_limit}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {coupon.expires_at ? formatExpiry(coupon.expires_at) : 'Nunca'}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleCouponStatus(coupon.id, coupon.is_active)}
                            title={coupon.is_active ? 'Clique para desativar' : 'Clique para ativar'}
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant={coupon.is_active ? 'success' : 'neutral'} className="cursor-pointer">
                              {coupon.is_active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                              {coupon.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteCoupon(coupon.id)}
                            aria-label="Excluir cupom"
                            className="text-ink-500 hover:text-danger hover:bg-danger-subtle"
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </section>
        </div>
      </AdminPage>
    </AdminLayout>
  );
};

export default Marketing;
