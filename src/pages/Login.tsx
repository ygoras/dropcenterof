import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { useSignIn, useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/apiClient";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, isLoaded } = useSignIn();
  const { setActive, signOut } = useClerk();
  const { isSignedIn } = useClerkAuth();
  const navigate = useNavigate();

  // If already signed in, sign out first (clean slate for login page)
  if (isSignedIn) {
    signOut();
  }

  const completeSignIn = async (sessionId: string) => {
    await setActive({ session: sessionId });
    // Redirect to root — ProtectedRoute will handle role-based routing
    window.location.href = "/";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });

      if (result.status === "complete" && result.createdSessionId) {
        await completeSignIn(result.createdSessionId);
      } else if (result.status === "needs_second_factor") {
        // Client Trust or MFA — prepare second factor via email code
        await signIn.prepareSecondFactor({
          strategy: "email_code",
        });
        setNeedsVerification(true);
        toast({ title: "Codigo de verificacao enviado", description: "Verifique seu e-mail." });
      } else if (result.status === "needs_first_factor") {
        toast({ title: "Verifique seu e-mail", description: "Um codigo de verificacao foi enviado.", variant: "destructive" });
      } else {
        toast({ title: "Erro no login", description: `Status inesperado: ${result.status}`, variant: "destructive" });
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.longMessage || err?.message || "Credenciais invalidas";
      toast({ title: "Erro ao entrar", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: verificationCode,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await completeSignIn(result.createdSessionId);
      } else {
        toast({ title: "Codigo invalido", description: "Tente novamente.", variant: "destructive" });
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.longMessage || err?.message || "Codigo invalido";
      toast({ title: "Erro na verificacao", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Boxes className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-2xl text-white">DropCenter</span>
          </div>
          <h1 className="font-display text-4xl font-bold text-white leading-tight mb-4">
            Gestao completa de operacao dropshipping
          </h1>
          <p className="text-lg text-white/60 leading-relaxed">
            Plataforma multi-vendedor com catalogo centralizado, controle de estoque em tempo real e integracao total com o Mercado Livre.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: "99.8%", label: "Uptime" },
              { value: "<2s", label: "Sync estoque" },
              { value: "24/7", label: "Monitoramento" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/50 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Boxes className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl text-foreground">DropCenter</span>
          </div>

          {needsVerification ? (
            /* Verification Code Form */
            <>
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="w-6 h-6 text-primary" />
                <h2 className="font-display text-2xl font-bold text-foreground">Verificacao de seguranca</h2>
              </div>
              <p className="text-muted-foreground mt-1 mb-8">
                Enviamos um codigo para <span className="text-foreground font-medium">{email}</span>
              </p>

              <form className="space-y-4" onSubmit={handleVerification}>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Codigo de verificacao</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    className="w-full h-14 px-4 rounded-lg border border-input bg-background text-foreground text-center text-2xl font-mono tracking-[0.5em] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || verificationCode.length < 6}
                  className="w-full h-11 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Verificar e entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setNeedsVerification(false); setVerificationCode(""); }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Voltar ao login
                </button>
              </form>
            </>
          ) : (
            /* Login Form */
            <>
              <h2 className="font-display text-2xl font-bold text-foreground">Entrar na plataforma</h2>
              <p className="text-muted-foreground mt-1 mb-8">Acesse seu painel de gestao</p>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 pl-10 pr-10 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !isLoaded}
                  className="w-full h-11 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
