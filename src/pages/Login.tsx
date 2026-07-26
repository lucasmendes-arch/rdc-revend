import { useState, useEffect } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ── Phone detection helpers ──────────────────────────────────────────────────

/** Returns true if value looks like a Brazilian phone number. */
function looksLikePhone(value: string): boolean {
  const clean = value.replace(/[\s\-\(\)\+\.]/g, "");
  return /^\d{10,13}$/.test(clean);
}

/** Normalize to E.164 (+55XXXXXXXXXXX). Returns null if unrecognized format. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return "+" + digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return "+55" + digits;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [pendingNav, setPendingNav] = useState(false);

  // Navigate only after AuthContext resolved user + role (avoids race condition
  // where SalaoRoute/AdminRoute see role=null before SIGNED_IN is processed).
  useEffect(() => {
    if (!pendingNav || authLoading || !user) return;
    const state = location.state as { returnTo?: string } | null;
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true });
      return;
    }
    if (role === "admin") navigate("/admin/financeiro", { replace: true });
    else if (role === "salao") navigate("/salao", { replace: true });
    else if (role === "administrativo") navigate("/admin/rh/candidatos", { replace: true });
    else navigate("/catalogo", { replace: true });
  }, [pendingNav, authLoading, user, role]);

  const identifierIsPhone = looksLikePhone(form.identifier.trim());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setResetSent(false);
  };

  const handleResetPassword = async () => {
    if (!form.identifier.trim()) {
      setError("Digite seu e-mail acima para recuperar a senha.");
      return;
    }
    setResetLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.identifier.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setResetLoading(false);
    if (resetError) {
      setError("Erro ao enviar e-mail de recuperação. Tente novamente.");
    } else {
      setResetSent(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const identifier = form.identifier.trim();

    try {
      // ── Phone login path ───────────────────────────────────────────────────
      // Uses resolve_partner_login_email RPC to translate phone → email
      // server-side (checks customer_segment + access_status). Then signs in
      // with email+password — no dependency on Supabase Phone provider.
      if (looksLikePhone(identifier)) {
        const normalizedPhone = normalizePhone(identifier);
        if (!normalizedPhone) {
          setError("E-mail ou senha incorretos.");
          setLoading(false);
          return;
        }

        const { data: partnerEmail, error: rpcError } = await supabase.rpc(
          "resolve_partner_login_email",
          { p_phone: normalizedPhone }
        );

        if (rpcError || !partnerEmail) {
          setError("E-mail ou senha incorretos.");
          setLoading(false);
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: partnerEmail,
          password: form.password,
        });

        if (signInError) {
          setError("E-mail ou senha incorretos.");
          setLoading(false);
          return;
        }

        setPendingNav(true);
        return;
      }

      // ── Email login path (default) ─────────────────────────────────────────
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password: form.password,
      });

      if (signInError) {
        setLoading(false);
        setError("E-mail ou senha incorretos.");
        return;
      }

      setPendingNav(true);
    } catch (err) {
      setLoading(false);
      setError("Erro ao fazer login. Tente novamente.");
      console.error("Erro no login:", err);
    }
  };

  return (
    // Tela de autenticação não leva header de aplicação: a marca fica centrada
    // acima do card, que é o padrão de SaaS e tira o peso visual da barra.
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <div className="w-10 h-10 rounded-lg border border-border bg-background flex items-center justify-center mb-3">
            <img src={logo} alt="" className="h-5 w-auto" />
          </div>
          <p className="text-[15px] font-semibold text-foreground tracking-tight">Rei dos Cachos</p>
          <p className="eyebrow mt-1.5">Portal do Parceiro</p>
        </div>

        <div className="surface-card p-6 sm:p-7">
          <h1 className="text-[17px] font-semibold text-foreground tracking-tight">
            Entrar
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1 mb-6">
            Acesse para gerenciar os seus pedidos e o catálogo.
          </p>

          {/* Erro fala o que houve e o que fazer — não pede desculpa. */}
          {error && (
            <div
              role="alert"
              className="mb-4 px-3 py-2.5 rounded-md bg-danger-subtle border border-danger-border text-danger text-[13px]"
            >
              {error}
            </div>
          )}

          {resetSent && (
            <div
              role="status"
              className="mb-4 px-3 py-2.5 rounded-md bg-success-subtle border border-success-border text-success text-[13px]"
            >
              E-mail de recuperação enviado. Verifique a sua caixa de entrada.
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="identifier" className="block text-[13px] font-medium text-foreground mb-1.5">
                E-mail ou telefone
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                <input
                  id="identifier"
                  type="text"
                  name="identifier"
                  required
                  autoComplete="username"
                  value={form.identifier}
                  onChange={handleChange}
                  placeholder="seu@email.com"
                  className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground tracking-snug placeholder:text-ink-400 transition-colors hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-foreground mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full h-9 pl-9 pr-10 rounded-md border border-input bg-background text-base md:text-sm text-foreground tracking-snug placeholder:text-ink-400 transition-colors hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Recuperação só faz sentido no caminho de e-mail. */}
            {!identifierIsPhone && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  className="text-[12px] font-medium text-ink-500 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {resetLoading ? "Enviando…" : "Esqueci minha senha"}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-md btn-primary text-sm mt-1"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-border text-center">
            <p className="text-[13px] text-muted-foreground">
              Ainda não tem conta?{" "}
              <Link to="/cadastro" className="font-medium text-foreground hover:underline underline-offset-4">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-400 mt-5">
          <Lock className="w-3 h-3" />
          Acesso restrito a parceiros cadastrados
        </p>
      </main>
    </div>
  );
};

export default Login;
