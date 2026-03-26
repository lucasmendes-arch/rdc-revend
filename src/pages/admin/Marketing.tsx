import { useState, useEffect } from 'react';
import { Megaphone, Save, Plus, Trash2, Tag, Calendar, Hash, Percent, RefreshCw, Power, PowerOff, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import type { StoreSettings, Coupon } from '@/types/marketing';

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
      toast.success('Configurações atualizadas!');
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
      
      toast.success('Cupom criado com sucesso!');
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

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-amber-500" />
              Marketing e Promoções
            </h1>
            <p className="text-muted-foreground">Gerencie cupons e regras de negócio da loja.</p>
          </div>
          <button 
            onClick={fetchData}
            className="p-2 rounded-lg bg-surface hover:bg-surface-alt transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* SESSÃO A: Configurações da Loja */}
          <section className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Configurações de Pedido
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Valor Mínimo do Pedido (Atacado)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={minCartValue}
                      onChange={(e) => setMinCartValue(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-amber-400 focus:outline-none bg-surface-alt/50 font-bold text-lg"
                      placeholder="500.00"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 px-1">
                    Clientes não conseguirão finalizar pedidos abaixo deste valor no catálogo.
                  </p>
                </div>

                <button
                  onClick={handleUpdateSettings}
                  disabled={savingSettings || loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-white font-bold hover:bg-foreground/90 transition-all disabled:opacity-50"
                >
                  {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Configuração
                </button>
              </div>
            </div>

            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
              <h3 className="text-sm font-bold text-amber-800 mb-2">Dica de Marketing</h3>
              <p className="text-xs text-amber-700 leading-relaxed">
                Valoradores mínimos de pedido são excelentes para garantir a rentabilidade em operações de atacado. Experimente baixar o valor mínimo durante feriados para aumentar o volume de pedidos.
              </p>
            </div>
          </section>

          {/* SESSÃO B: Gestão de Cupons */}
          <section className="lg:col-span-2 space-y-6">
            {/* Create Coupon Form */}
            <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                Criar Novo Cupom
              </h2>

              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Código do Cupom</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={newCoupon.code}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="EX: BEMVINDO10"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Tipo</label>
                  <select
                    value={newCoupon.discount_type}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_type: e.target.value as 'fixed' | 'percent' | 'free_shipping' | 'shipping_percent' }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
                  >
                    <option value="percent">Porcentagem (%)</option>
                    <option value="fixed">Valor Fixo (R$)</option>
                    <option value="free_shipping">Frete Grátis</option>
                    <option value="shipping_percent">% Desconto Frete</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Valor</label>
                  <div className="relative">
                    {(newCoupon.discount_type === 'percent' || newCoupon.discount_type === 'shipping_percent') ? (
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    ) : (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">R$</span>
                    )}
                    <input
                      type="number"
                      value={newCoupon.discount_type === 'free_shipping' ? '0' : newCoupon.discount_value}
                      disabled={newCoupon.discount_type === 'free_shipping'}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_value: e.target.value }))}
                      placeholder={newCoupon.discount_type === 'shipping_percent' ? '50' : '10'}
                      className={`w-full ${newCoupon.discount_type === 'fixed' ? 'pl-9' : 'pr-10'} py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:bg-surface-alt disabled:cursor-not-allowed`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Validade (Opcional)</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={newCoupon.expires_at}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, expires_at: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Limite de Usos</label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={newCoupon.usage_limit}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, usage_limit: e.target.value }))}
                      placeholder="Ilimitado"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={creatingCoupon}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {creatingCoupon ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    CRIAR CUPOM
                  </button>
                </div>
              </form>
            </div>

            {/* Coupons List */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Tag className="w-5 h-5 text-amber-500" />
                  Cupons Ativos
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-alt/50 text-[10px] uppercase font-bold text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3">Código</th>
                      <th className="px-6 py-3">Desconto</th>
                      <th className="px-6 py-3">Usos</th>
                      <th className="px-6 py-3">Expira em</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {coupons.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          Nenhum cupom cadastrado ainda.
                        </td>
                      </tr>
                    ) : (
                      coupons.map((coupon) => (
                        <tr key={coupon.id} className={`hover:bg-surface/30 transition-colors ${!coupon.is_active ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 font-mono font-bold text-xs uppercase border border-amber-200">
                              {coupon.code}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-foreground">
                              {coupon.discount_type === 'fixed' ? `R$ ${coupon.discount_value.toFixed(2)}` :
                               coupon.discount_type === 'percent' ? `${coupon.discount_value}%` :
                               coupon.discount_type === 'shipping_percent' ? `${coupon.discount_value}% Frete` : 'Frete Grátis'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground">{coupon.used_count}</span>
                              {coupon.usage_limit && (
                                <span className="text-[10px] text-muted-foreground">limite: {coupon.usage_limit}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString() : 'Nunca'}
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => toggleCouponStatus(coupon.id, coupon.is_active)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                                coupon.is_active 
                                ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' 
                                : 'bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700'
                              }`}
                            >
                              {coupon.is_active ? (
                                <><Power className="w-3 h-3" /> ATIVO</>
                              ) : (
                                <><PowerOff className="w-3 h-3" /> INATIVO</>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => deleteCoupon(coupon.id)}
                              className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Marketing;
