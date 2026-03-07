import { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Crown, Building2, Store, User, Mail, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { isValidCPF, isValidCNPJ } from "@/utils/validateDocument";

type DocumentType = 'CPF' | 'CNPJ';
type BusinessType = 'salao' | 'revenda' | 'loja' | '';

export default function Cadastro() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Form State
    const [docType, setDocType] = useState<DocumentType>('CPF');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: '',
        document: '',
        businessType: '' as BusinessType,
        employees: '',
        revenue: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let { name, value } = e.target;

        // Apply Masks
        if (name === 'phone') {
            value = value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/^(\d{2})(\d{4,5})(\d{4}).*/, '($1) $2-$3');
            }
        } else if (name === 'document') {
            value = value.replace(/\D/g, '');
            if (docType === 'CPF') {
                if (value.length <= 11) {
                    value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
                }
            } else {
                if (value.length <= 14) {
                    value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
                }
            }
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDocTypeToggle = (type: DocumentType) => {
        setDocType(type);
        setFormData(prev => ({ ...prev, document: '' })); // clear document on toggle
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (formData.password.length < 6) {
                setError('A senha deve ter pelo menos 6 caracteres.');
                setLoading(false);
                return;
            }

            // Validate document checksum
            const docDigits = formData.document.replace(/\D/g, '');
            if (docType === 'CPF' && !isValidCPF(docDigits)) {
                setError('CPF inválido. Verifique os dígitos.');
                setLoading(false);
                return;
            }
            if (docType === 'CNPJ' && !isValidCNPJ(docDigits)) {
                setError('CNPJ inválido. Verifique os dígitos.');
                setLoading(false);
                return;
            }

            // 1. Create auth user
            const { error: signUpError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: { full_name: formData.name },
                },
            });

            if (signUpError) {
                if (signUpError.message.includes('already registered')) {
                    setError('Este e-mail já está cadastrado. Faça login.');
                } else {
                    setError(signUpError.message);
                }
                setLoading(false);
                return;
            }

            // 2. Save extra profile data (trigger already created the profile row)
            // Small delay to ensure trigger has run
            await new Promise(r => setTimeout(r, 500));

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('profiles').update({
                    full_name: formData.name,
                    phone: formData.phone,
                    document_type: docType,
                    document: formData.document,
                    business_type: formData.businessType,
                    employees: formData.employees,
                    revenue: formData.revenue,
                }).eq('id', user.id);
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
                    document_type: docType,
                    document: formData.document,
                    business_type: formData.businessType,
                    catalog_url: `${window.location.origin}/login`,
                }),
            }).catch(err => console.warn('Webhook error:', err));

            // Login automático (email confirmation disabled)
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
                        <span className="hidden sm:inline">Voltar ao Login</span>
                    </Link>
                    <img src={logo} alt="Rei dos Cachos" className="h-10 sm:h-12 w-auto" />
                    <div className="w-20" /> {/* Spacer for centering */}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 sm:py-12">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 gradient-gold flex items-center justify-center shadow-gold">
                        <Crown className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">
                        Crie sua conta B2B
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        Preencha seus dados para solicitar acesso exclusivo ao nosso catálogo de revenda.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">

                    {/* Section 1: Dados Pessoais */}
                    <div className="bg-white rounded-2xl p-5 sm:p-8 shadow-sm border border-border">
                        <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-black">1</span>
                            Seus Dados
                        </h2>

                        {error && (
                            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
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

                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-1.5">Nome Completo</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Ex: Maria das Graças"
                                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-1.5">WhatsApp / Telefone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    required
                                    value={formData.phone}
                                    onChange={handleChange}
                                    maxLength={15}
                                    placeholder="(00) 00000-0000"
                                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-2">Tipo de Documento</label>
                                <div className="flex p-1 bg-surface rounded-xl border border-border mb-3">
                                    <button
                                        type="button"
                                        onClick={() => handleDocTypeToggle('CPF')}
                                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${docType === 'CPF' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-300' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Pessoa Física (CPF)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDocTypeToggle('CNPJ')}
                                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${docType === 'CNPJ' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-300' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Pessoa Jurídica (CNPJ)
                                    </button>
                                </div>

                                <input
                                    type="text"
                                    name="document"
                                    required
                                    value={formData.document}
                                    onChange={handleChange}
                                    maxLength={docType === 'CPF' ? 14 : 18}
                                    placeholder={docType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: O Negócio */}
                    <div className="bg-white rounded-2xl p-5 sm:p-8 shadow-sm border border-border">
                        <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-black">2</span>
                            Seu Negócio
                        </h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-3">Tipo de Atuação</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, businessType: 'salao' }))}
                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${formData.businessType === 'salao' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                                    >
                                        <Building2 className="w-6 h-6" />
                                        <span className="text-xs font-bold">Salão de Beleza</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, businessType: 'loja' }))}
                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${formData.businessType === 'loja' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                                    >
                                        <Store className="w-6 h-6" />
                                        <span className="text-xs font-bold">Loja / Comércio</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, businessType: 'revenda' }))}
                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${formData.businessType === 'revenda' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border bg-surface text-muted-foreground hover:border-gold-border'}`}
                                    >
                                        <User className="w-6 h-6" />
                                        <span className="text-xs font-bold">Autônomo(a)</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-foreground mb-1.5">Nº de Funcionários</label>
                                    <div className="relative">
                                        <select
                                            name="employees"
                                            required
                                            value={formData.employees}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm appearance-none"
                                        >
                                            <option value="" disabled>Selecione...</option>
                                            <option value="1-3">De 1 a 3 funcionários</option>
                                            <option value="4-7">De 4 a 7 funcionários</option>
                                            <option value="8-10">De 8 a 10 funcionários</option>
                                            <option value="+10">Mais de 10 funcionários</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                            ▼
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-foreground mb-1.5">Faturamento Estimado</label>
                                    <div className="relative">
                                        <select
                                            name="revenue"
                                            required
                                            value={formData.revenue}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm appearance-none"
                                        >
                                            <option value="" disabled>Selecione a faixa...</option>
                                            <option value="1k_5k">R$ 1.000 a R$ 5.000 / mês</option>
                                            <option value="6k_10k">R$ 6.000 a R$ 10.000 / mês</option>
                                            <option value="10k_30k">R$ 10.000 a R$ 30.000 / mês</option>
                                            <option value="30k_50k">R$ 30.000 a R$ 50.000 / mês</option>
                                            <option value="acima_50k">Mais de R$ 50.000 / mês</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                            ▼
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !formData.businessType}
                        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-lg btn-gold text-white disabled:opacity-70 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <CheckCircle2 className="w-5 h-5" />
                                Concluir Cadastro
                            </>
                        )}
                    </button>
                </form>
            </main>
        </div>
    );
}
