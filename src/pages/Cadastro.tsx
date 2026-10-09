import { useState, useRef } from "react";
import { ArrowLeft, Check, CheckCircle2, Building2, Store, User, Mail, Lock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useTrackConversion } from '@/lib/hooks/useFacebookConversion';

type BusinessType = 'salao' | 'revenda' | 'loja' | '';

function splitFullName(name: string): { firstName?: string; lastName?: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return {};
    }

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || undefined,
    };
}

export default function Cadastro() {
    const navigate = useNavigate();
    const trackConversion = useTrackConversion();
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
                const { firstName, lastName } = splitFullName(formData.name);

                const { error: profileError } = await supabase.from('profiles').update({
                    full_name: formData.name,
                    phone: formData.phone,
                    business_type: formData.businessType,
                }).eq('id', user.id);

                if (profileError) {
                    console.error('[CADASTRO] Erro ao atualizar profile:', profileError);
                }

                trackConversion({
                    eventName: 'Lead',
                    email: formData.email,
                    phone: formData.phone,
                    firstName,
                    lastName,
                    country: 'br',
                    contentName: 'Cadastro atacado',
                    contentType: 'lead_form',
                    externalId: user.id,
                    eventId: `lead_${user.id}`,
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

    // Mesmo campo do Login: 40px, ícone à esquerda, foco em anel.
    const inputClass =
        'w-full h-10 pl-10 pr-3 rounded-md border border-input bg-background shadow-xs text-base md:text-sm text-foreground tracking-snug placeholder:text-ink-400 transition-colors hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent';

    const businessOptions: { value: Exclude<BusinessType, ''>; label: string; icon: typeof Building2 }[] = [
        { value: 'salao', label: 'Salão de beleza', icon: Building2 },
        { value: 'loja', label: 'Loja / comércio', icon: Store },
        { value: 'revenda', label: 'Autônomo(a)', icon: User },
    ];

    return (
        // Mesmo shell do Login: centralizado, logo em cima, luz ambiente.
        <div className="min-h-screen bg-background bg-ambient flex flex-col">
            <main className="flex-1 w-full max-w-[420px] mx-auto px-4 py-8 sm:py-12">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-foreground transition-colors -ml-1 px-1 py-1 rounded-md"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                </Link>

                <img src={logo} alt="Rei dos Cachos" className="h-14 w-auto mx-auto mt-6 mb-8" />

                <div className="text-center mb-6">
                    <h1 className="text-[26px] leading-tight text-foreground">
                        Libere os preços de atacado
                    </h1>
                    <p className="text-[14px] text-muted-foreground mt-2">
                        Cadastre-se grátis e acesse o catálogo completo com preços de revenda.
                    </p>

                    {new URLSearchParams(window.location.search).get('teaser') === '1' && (
                        <div className="bg-brand-subtle border border-brand-border rounded-lg px-3.5 py-3 mt-4">
                            <p className="text-brand-strong text-[13px] font-medium">
                                Você está a um passo de desbloquear os melhores preços de revenda.
                            </p>
                        </div>
                    )}
                </div>

                {/* Benefícios: ícone de sistema no lugar de emoji — emoji muda de
                    forma e de cor por plataforma e não acompanha o tema. */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-6 text-[12px] text-muted-foreground">
                    {['Grátis', 'Sem compromisso', 'Acesso imediato'].map(label => (
                        <span key={label} className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-success shrink-0" />
                            {label}
                        </span>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {error && (
                        <div
                            ref={errorRef}
                            role="alert"
                            className="px-3 py-2.5 rounded-md bg-danger-subtle border border-danger-border text-danger text-[13px]"
                        >
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="cad-name" className="field-label">Nome completo</label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                            <input
                                id="cad-name"
                                type="text"
                                name="name"
                                required
                                autoComplete="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Ex.: Maria das Graças"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="cad-phone" className="field-label">WhatsApp</label>
                        <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                            <input
                                id="cad-phone"
                                type="tel"
                                name="phone"
                                required
                                autoComplete="tel"
                                value={formData.phone}
                                onChange={handleChange}
                                maxLength={15}
                                placeholder="(00) 00000-0000"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="cad-email" className="field-label">E-mail</label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                            <input
                                id="cad-email"
                                type="email"
                                name="email"
                                required
                                autoComplete="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="seu@email.com"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="cad-password" className="field-label">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                            <input
                                id="cad-password"
                                type="password"
                                name="password"
                                required
                                minLength={6}
                                autoComplete="new-password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Mínimo 6 caracteres"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <fieldset>
                        <legend className="field-label">Como você atua?</legend>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">
                            {businessOptions.map(({ value, label, icon: Icon }) => {
                                const active = formData.businessType === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setFormData(prev => ({ ...prev, businessType: value }))}
                                        className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-lg border transition-colors ${
                                            active
                                                ? 'border-brand bg-brand-subtle text-foreground ring-1 ring-brand'
                                                : 'border-border bg-card text-muted-foreground hover:border-ink-300 hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className={`w-5 h-5 ${active ? 'text-brand-strong' : ''}`} />
                                        <span className="text-[12px] font-medium leading-tight text-center">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {!formData.businessType && (
                            <p className="text-[12px] text-muted-foreground mt-2">Escolha uma opção para continuar.</p>
                        )}
                    </fieldset>

                    <Button
                        type="submit"
                        size="lg"
                        disabled={loading || !formData.businessType}
                        className="w-full mt-2"
                    >
                        {loading ? (
                            <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                                Criando conta…
                            </>
                        ) : (
                            <>
                                <CheckCircle2 />
                                Acessar catálogo agora
                            </>
                        )}
                    </Button>
                </form>

                <div className="mt-5 pt-5 border-t border-border text-center">
                    <p className="text-[13px] text-muted-foreground">
                        Já tem conta?{' '}
                        <Link to="/login" className="font-semibold text-brand-strong hover:underline underline-offset-4">
                            Faça login
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
