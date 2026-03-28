import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setLoading(false);
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      return;
    }

    // Fetch user role to redirect appropriately
    try {
      const me = await api.get<{ roles: string[] }>("/api/auth/me");
      const isAdmin = me.roles?.some((r) => r === "admin" || r === "manager");
      const isOperator = me.roles?.some((r) => r === "operator");
      setLoading(false);
      if (isOperator) {
        navigate("/operacao");
      } else if (isAdmin) {
        navigate("/dashboard");
      } else {
        navigate("/seller/dashboard");
      }
    } catch {
      setLoading(false);
      navigate("/dashboard");
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
            Gestão completa de operação dropshipping
          </h1>
          <p className="text-lg text-white/60 leading-relaxed">
            Plataforma multi-vendedor com catálogo centralizado, controle de estoque em tempo real e integração total com o Mercado Livre.
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

          <h2 className="font-display text-2xl font-bold text-foreground">Entrar na plataforma</h2>
          <p className="text-muted-foreground mt-1 mb-8">Acesse seu painel de gestão</p>

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

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                <input type="checkbox" className="rounded border-input" />
                Lembrar de mim
              </label>
              <a href="#" className="text-primary hover:underline font-medium">Esqueci a senha</a>
            </div>

            <button
              type="submit"
              disabled={loading}
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

          <p className="text-center text-sm text-muted-foreground mt-6">
            Ainda não tem conta?{" "}
            <Link to="/registro" className="text-primary hover:underline font-medium">Criar conta</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
