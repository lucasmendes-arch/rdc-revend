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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 h-16 flex items-center">
        <div className="container mx-auto flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="Rei dos Cachos" className="h-4 w-auto" />
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-gray-900">Rei dos Cachos</p>
            <p className="text-[10px] text-amber-600 font-medium tracking-[0.15em] uppercase">
              Portal do Parceiro
            </p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h1 className="text-xl font-bold text-gray-900 text-center mb-1">
              Acessar o Portal
            </h1>
            <p className="text-gray-500 text-center text-sm mb-8">
              Entre com seus dados para gerenciar pedidos e catálogo
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                {error}
              </div>
            )}

            {resetSent && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm">
                E-mail de recuperação enviado! Verifique sua caixa de entrada.
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Identifier (email or phone) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    name="identifier"
                    required
                    autoComplete="username"
                    value={form.identifier}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-300 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-300 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Forgot password — only shown for email input */}
              {!identifierIsPhone && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="text-xs text-amber-600 hover:underline disabled:opacity-50"
                  >
                    {resetLoading ? "Enviando..." : "Esqueci minha senha"}
                  </button>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                Ainda não tem conta?{" "}
                <Link
                  to="/cadastro"
                  className="font-semibold text-amber-600 hover:underline"
                >
                  Cadastre-se
                </Link>
              </p>
            </div>
          </div>

          {/* Trust */}
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400 mt-6">
            <Lock className="w-3 h-3" />
            Acesso restrito a parceiros cadastrados
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
