import { useState } from "react";
import { ArrowRight, Crown, Eye, EyeOff, Lock, Mail, ArrowLeft } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";

interface LocationState {
  returnTo?: string;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (signInError) {
        setLoading(false);
        setError("E-mail ou senha incorretos.");
        return;
      }

      const state = location.state as LocationState | null;
      const returnTo = state?.returnTo || "/catalogo";
      navigate(returnTo, { replace: true });
    } catch (err) {
      setLoading(false);
      setError("Erro ao fazer login. Tente novamente.");
      console.error("Erro no login:", err);
    }
  };

  return (
    <div className="min-h-screen bg-surface-alt flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 sm:px-6 h-16 flex items-center">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/">
            <img src={logo} alt="Rei dos Cachos" className="h-12 w-auto" />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-2xl border border-border shadow-card p-8">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center mx-auto mb-6 shadow-gold">
              <Crown className="w-7 h-7 text-white" />
            </div>

            <h1 className="text-2xl font-bold text-foreground text-center mb-1">
              Área do Cliente
            </h1>
            <p className="text-muted-foreground text-center text-sm mb-8">
              Acesse o catálogo exclusivo para revendedores
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-base btn-gold text-white disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Acessar Catálogo
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Ainda não tem conta?{" "}
                <Link
                  to="/#cadastro"
                  className="font-semibold text-gold-text hover:underline"
                >
                  Cadastre-se gratuitamente
                </Link>
              </p>
            </div>
          </div>

          {/* Trust */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            🔒 Acesso seguro e exclusivo para revendedores cadastrados
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
