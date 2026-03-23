import { useState, useEffect } from "react";
import { ArrowRight, Crown, Lock, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";

const RedefinirSenha = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    // Supabase coloca o token no hash da URL ao redirecionar do e-mail de recovery.
    // O evento PASSWORD_RECOVERY sinaliza que o token foi processado e a sessão está pronta.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setTokenReady(true);
      }
    });

    // Se já houver sessão ativa com tipo recovery (ex: reload da página), verificar estado atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setTokenReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Erro ao redefinir a senha. O link pode ter expirado. Solicite um novo.");
      return;
    }

    setSuccess(true);
    // Aguarda 2s para o usuário ver a mensagem de sucesso antes de redirecionar
    setTimeout(() => navigate("/login"), 2000);
  };

  return (
    <div className="min-h-screen bg-surface-alt flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 sm:px-6 h-16 flex items-center">
        <div className="container mx-auto flex items-center justify-between">
          <div className="select-none pointer-events-none">
            <img src={logo} alt="Rei dos Cachos" className="h-12 w-auto" />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-border shadow-card p-8">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center mx-auto mb-6 shadow-gold">
              {success ? (
                <CheckCircle className="w-7 h-7 text-white" />
              ) : (
                <Crown className="w-7 h-7 text-white" />
              )}
            </div>

            {success ? (
              <>
                <h1 className="text-2xl font-bold text-foreground text-center mb-2">
                  Senha redefinida!
                </h1>
                <p className="text-muted-foreground text-center text-sm">
                  Sua senha foi atualizada com sucesso. Redirecionando para o login...
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground text-center mb-1">
                  Redefinir Senha
                </h1>
                <p className="text-muted-foreground text-center text-sm mb-8">
                  Digite sua nova senha abaixo
                </p>

                {error && (
                  <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                    {error}
                  </div>
                )}

                {!tokenReady && (
                  <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm">
                    Validando link de recuperação...
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Nova senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Confirmar nova senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                        placeholder="Repita a nova senha"
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !tokenReady}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-base btn-gold text-white disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        Salvar nova senha
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            🔒 Acesso seguro e exclusivo para revendedores cadastrados
          </p>
        </div>
      </main>
    </div>
  );
};

export default RedefinirSenha;
