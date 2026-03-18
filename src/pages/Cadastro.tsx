import { useState, useRef } from "react";
import { ArrowLeft, CheckCircle2, Crown, Building2, Store, User, Mail, Lock, Phone } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { crmService } from '@/services/crm';
import { CrmEventCode } from '@/types/crm';

type BusinessType = 'salao' | 'revenda' | 'loja' | '';

export default function Cadastro() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const errorRef = useRef<HTMLDivElement>(null);

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    };

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: '',
        businessType: '' as BusinessType,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value: rawValue } = e.target;
        let value = rawValue;

        if (name === 'phone') {
            value = value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/^(\d{2})(\d{4,5})(\d{4}).*/, '($1) $2-$3');
            }
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (formData.password.length < 6) {
                showError('A senha deve ter pelo menos 6 caracteres.');
                setLoading(false);
                return;
            }

            // 1. Create auth user
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: { full_name: formData.name },
                },
            });

            if (signUpError) {
                if (signUpError.message.includes('already registered')) {
                    showError('Este e-mail já está cadastrado. Faça login.');
                } else {
                    showError(signUpError.message);
                }
                setLoading(false);
                return;
            }

            const user = authData?.user;

            // 2. Save profile (only fields collected at registration)
            if (user) {
                const { error: profileError } = await supabase.from('profiles').update({
                    full_name: formData.name,
                    phone: formData.phone,
                    business_type: formData.businessType,
                }).eq('id', user.id);

                if (profileError) {
                    console.error('[CADASTRO] Erro ao atualizar profile:', profileError);
                }

                // CRM event
                crmService.trackEvent({
                    user_id: user.id,
                    session_id: `user_${user.id}`,
                    event_type: CrmEventCode.USER_REGISTERED,
                    metadata: {
                        name: formData.name,
                        email: formData.email,
                        business_type: formData.businessType,
                    },
                });
            }

            // 3. Notify via webhook (fiqon → WhatsApp)
            const webhookUrl = import.meta.env.VITE_WEBHOOK_URL || 'https://webhook.fiqon.app/webhook/019cb699-cef9-724f-9b43-35b59db12c5e/66fd06ea-361f-48f4-8909-03de418f2c28';
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'new_registration',
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    business_type: formData.businessType,
                    catalog_url: `${window.location.origin}/login`,
                }),
            }).catch(err => console.warn('Webhook error:', err));

            navigate('/catalogo', { replace: true });
        } catch (err) {
            setError('Erro ao criar conta. Tente novamente.');
            console.error('Cadastro error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-alt flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-border px-4 sm:px-6 h-16 flex items-center sticky top-0 z-10">
                <div className="container mx-auto flex items-center justify-between">
                    <Link to="/login" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="hidden sm:inline">Voltar</span>
                    </Link>
                    <img src={logo} alt="Rei dos Cachos" className="h-10 sm:h-12 w-auto" />
                    <div className="w-20" />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 sm:py-12">
                {/* Hero */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 gradient-gold flex items-center justify-center shadow-gold">
                        <Crown className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">
                        Libere os preços de atacado
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        Cadastre-se grátis e acesse o catálogo completo com preços de revenda
                    </p>

                    {new URLSearchParams(window.location.search).get('teaser') === '1' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <p className="text-amber-800 text-sm font-bold">
                                🚀 Você está a um passo de desbloquear os melhores preços de revenda.
                            </p>
                        </div>
                    )}
                </div>

                {/* Benefits row */}
                <div className="flex items-center justify-center gap-4 mb-6 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">✅ Grátis</span>
                    <span className="flex items-center gap-1">✅ Sem compromisso</span>
                    <span className="flex items-center gap-1">✅ Acesso imediato</span>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 sm:p-8 shadow-sm border border-border space-y-4">

                    {error && (
                        <div ref={errorRef} className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Nome completo</label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Ex: Maria das Graças"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* WhatsApp */}
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">WhatsApp</label>
                        <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="tel"
                                name="phone"
                                required
                                value={formData.phone}
                                onChange={handleChange}
                                maxLength={15}
                                placeholder="(00) 00000-0000"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">E-mail</label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="seu@email.com"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="password"
                                name="password"
                                required
                                minLength={6}
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Mínimo 6 caracteres"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* Business Type */}
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-3">Como você atua?</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, businessType: 'salao' }))}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all ${formData.businessType === 'salao' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                            >
                                <Building2 className="w-5 h-5" />
                                <span className="text-[10px] sm:text-xs font-bold leading-tight text-center">Salão de Beleza</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, businessType: 'loja' }))}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all ${formData.businessType === 'loja' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                            >
                                <Store className="w-5 h-5" />
                                <span className="text-[10px] sm:text-xs font-bold leading-tight text-center">Loja / Comércio</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, businessType: 'revenda' }))}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all ${formData.businessType === 'revenda' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                            >
                                <User className="w-5 h-5" />
                                <span className="text-[10px] sm:text-xs font-bold leading-tight text-center">Autônomo(a)</span>
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !formData.businessType}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-base btn-gold text-white disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all mt-2"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Acessar catálogo agora
                            </>
                        )}
                    </button>

                    <p className="text-center text-xs text-muted-foreground pt-1">
                        Já tem conta?{' '}
                        <Link to="/login" className="text-gold-text font-semibold hover:underline">
                            Faça login
                        </Link>
                    </p>
                </form>
            </main>
        </div>
    );
}
