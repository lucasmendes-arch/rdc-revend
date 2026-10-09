import { useState, useEffect } from "react";
import { ArrowRight, Lock, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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

  // Mesmo campo do Login: 40px, ícone à esquerda, foco em anel.
  const inputClass =
    "w-full h-10 pl-10 pr-3 rounded-md border border-input bg-background shadow-xs text-base md:text-sm text-foreground tracking-snug placeholder:text-ink-400 transition-colors hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent";

  return (
    // Mesmo shell do Login: centralizado, logo em cima, luz ambiente.
    <div className="min-h-screen bg-background bg-ambient flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <img src={logo} alt="Rei dos Cachos" className="h-14 w-auto mx-auto mb-10" />

          {success ? (
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border border-success-border bg-success-subtle flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <h1 className="text-[26px] leading-tight text-foreground">Senha redefinida</h1>
              <p className="text-[14px] text-muted-foreground mt-2">
                Sua senha foi atualizada. Levando você para o login…
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-[26px] leading-tight text-foreground text-center">Redefinir senha</h1>
              <p className="text-[14px] text-muted-foreground mt-2 mb-8 text-center">
                Escolha uma nova senha para a sua conta.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mb-4 px-3 py-2.5 rounded-md bg-danger-subtle border border-danger-border text-danger text-[13px]"
                >
                  {error}
                </div>
              )}

              {/* Estado transitório, não alerta: nada deu errado ainda. */}
              {!tokenReady && (
                <div role="status" className="mb-4 px-3 py-2.5 rounded-md bg-muted border border-border text-muted-foreground text-[13px] flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-300 border-t-foreground animate-spin shrink-0" />
                  Validando o link de recuperação…
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="new-password" className="field-label">Nova senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                    <input
                      id="new-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      placeholder="Mínimo 6 caracteres"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="field-label">Confirmar nova senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                      placeholder="Repita a nova senha"
                      className={inputClass}
                    />
                  </div>
                </div>

                <Button type="submit" size="lg" disabled={loading || !tokenReady} className="w-full mt-2">
                  {loading ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      Salvar nova senha
                      <ArrowRight />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 pt-5 border-t border-border text-center">
                <p className="text-[13px] text-muted-foreground">
                  O link expirou?{" "}
                  <Link to="/login" className="font-semibold text-brand-strong hover:underline underline-offset-4">
                    Peça um novo no login
                  </Link>
                </p>
              </div>
            </>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-400 mt-5">
            <Lock className="w-3 h-3" />
            Acesso restrito a parceiros cadastrados
          </p>
        </div>
      </main>
    </div>
  );
};

export default RedefinirSenha;
