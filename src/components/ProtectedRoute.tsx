import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { AlertTriangle, CreditCard, Sparkles } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPortal?: "platform" | "seller";
}

export const ProtectedRoute = ({ children, requiredPortal }: ProtectedRouteProps) => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, isManager, isSeller, hasRole, loading: roleLoading } = useRole();
  const isOperator = hasRole("operator");
  const location = useLocation();

  const isPending = user?.subscription_status === "pending" && !isAdmin && !isManager;
  const isBlocked = user?.subscription_status === "blocked" && !isAdmin && !isManager;

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role-based routing enforcement
  const isOnSellerRoute = location.pathname.startsWith("/seller");
  const isOnOperatorRoute = location.pathname.startsWith("/operacao");
  const isOnPlatformRoute = !isOnSellerRoute && !isOnOperatorRoute;

  // Operators can only access /operacao routes
  if (isOperator && !isAdmin && !isManager && !isOnOperatorRoute) {
    return <Navigate to="/operacao" replace />;
  }

  // Sellers trying to access platform routes -> redirect to seller dashboard
  if (isSeller && !isAdmin && !isManager && isOnPlatformRoute) {
    return <Navigate to="/seller/dashboard" replace />;
  }

  // Allow access to /seller/plano even when pending (so they can pay)
  if (isPending && !location.pathname.startsWith("/seller/plano")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Ative sua assinatura
          </h1>
          <p className="text-muted-foreground mb-6">
            Bem-vindo ao DropCenter! Para acessar a plataforma, ative sua assinatura realizando o pagamento do plano.
          </p>
          <Link
            to="/seller/plano"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <CreditCard className="w-4 h-4" />
            Ir para Meu Plano
          </Link>
          <div className="mt-4">
            <button
              onClick={() => signOut()}
              className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Acesso Bloqueado
          </h1>
          <p className="text-muted-foreground mb-6">
            Sua assinatura está bloqueada por inadimplência. Para regularizar seu acesso,
            realize o pagamento via PIX e entre em contato com o suporte.
          </p>
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning mb-6">
            <div className="flex items-center gap-2 justify-center font-medium">
              <CreditCard className="w-4 h-4" />
              Pagamento pendente via PIX
            </div>
            <p className="mt-1 text-xs">
              Seus anúncios no Mercado Livre foram pausados automaticamente.
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
