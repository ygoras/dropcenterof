import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Wallet,
  BarChart3,
  Settings,
  Boxes,
  Truck,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Store,
  ClipboardList,
  Tag,
  ShieldAlert,
  Shield,
  HardHat,
  Menu,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  alert?: boolean;
  alertLabel?: string;
}

const platformNav: NavItem[] = [
  { label: "Cockpit", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Vendedores", icon: Users, path: "/vendedores" },
  { label: "Catálogo Master", icon: Tag, path: "/catalogo" },
  { label: "Estoque / WMS", icon: Boxes, path: "/estoque" },
  { label: "Pedidos", icon: ShoppingCart, path: "/pedidos" },
  { label: "Mercado Livre", icon: Store, path: "/mercadolivre" },
  { label: "Alertas ML", icon: ShieldAlert, path: "/alertas-ml" },
  { label: "Logística", icon: Truck, path: "/logistica" },
  { label: "Operadores", icon: HardHat, path: "/operadores" },
  { label: "Atendimento", icon: MessageSquare, path: "/atendimento" },
  { label: "Financeiro", icon: Wallet, path: "/financeiro" },
  { label: "Planos", icon: CreditCard, path: "/planos" },
  { label: "Relatórios", icon: BarChart3, path: "/relatorios" },
  { label: "Auditoria", icon: ShieldAlert, path: "/auditoria" },
  { label: "Usuários Internos", icon: Shield, path: "/usuarios" },
  { label: "Configurações", icon: Settings, path: "/configuracoes" },
];

const baseSellerNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/seller/dashboard" },
  { label: "Integração ML", icon: Store, path: "/seller/integracao" },
  { label: "Catálogo", icon: Package, path: "/seller/catalogo" },
  { label: "Anúncios", icon: ClipboardList, path: "/seller/anuncios" },
  { label: "Envio / Frete", icon: Truck, path: "/seller/envio" },
  { label: "Pedidos", icon: ShoppingCart, path: "/seller/pedidos" },
  { label: "Crédito", icon: Wallet, path: "/seller/credito" },
  { label: "Meu Plano", icon: CreditCard, path: "/seller/plano" },
  { label: "Relatórios", icon: BarChart3, path: "/seller/relatorios" },
  { label: "Suporte", icon: MessageSquare, path: "/seller/atendimento" },
  { label: "Configurações", icon: Settings, path: "/seller/configuracoes" },
];

const operatorNav: NavItem[] = [
  { label: "Visão Geral", icon: LayoutDashboard, path: "/operacao" },
  { label: "Separação", icon: ClipboardList, path: "/operacao/separacao" },
  { label: "Embalagem", icon: Package, path: "/operacao/embalagem" },
];

interface AppSidebarProps {
  portal: "platform" | "seller" | "operator";
}

export function AppSidebar({ portal }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lowBalance, setLowBalance] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const location = useLocation();
  const { profile } = useProfile();

  // Fetch wallet status for seller portal
  useEffect(() => {
    if (portal !== "seller" || !profile?.tenant_id) return;

    const checkBalance = async () => {
      try {
        const data = await api.post<{ error?: string; days_until_empty: number | null }>("/api/asaas-pix", { action: "get_spending_forecast" });
        if (data && !data.error) {
          const days = data.days_until_empty;
          setDaysLeft(days);
          setLowBalance(days !== null && days <= 7);
        }
      } catch {}
    };

    checkBalance();
  }, [portal, profile?.tenant_id]);

  const navItems = portal === "platform"
    ? platformNav
    : portal === "seller"
    ? baseSellerNav.map((item) =>
        item.path === "/seller/credito" && lowBalance
          ? { ...item, alert: true, alertLabel: daysLeft !== null ? `${daysLeft}d` : "!" }
          : item
      )
    : operatorNav;

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const portalLabel = portal === "platform" ? "Portal Interno" : portal === "seller" ? "Portal Vendedor" : "Portal Operação";

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-glow">
            <Boxes className="w-4.5 h-4.5 text-white" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <p className="font-display font-bold text-sm text-sidebar-accent-foreground leading-none tracking-tight">
                DropCenter
              </p>
              <p className="text-[10px] text-sidebar-foreground mt-0.5">
                {portalLabel}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? "bg-sidebar-primary/15 text-sidebar-primary shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />
              )}
              <item.icon className={cn(
                "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                isActive ? "text-sidebar-primary" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground"
              )} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.alert && !collapsed && (
                <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/20 text-warning">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {item.alertLabel}
                </span>
              )}
              {item.alert && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle - desktop only */}
      <div className="hidden lg:block p-2.5 border-t border-sidebar-border/50">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-xl text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl glass flex items-center justify-center text-foreground hover:bg-secondary/50 transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 w-[280px] glass-sidebar flex flex-col transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex h-screen glass-sidebar flex-col transition-all duration-300 sticky top-0",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
