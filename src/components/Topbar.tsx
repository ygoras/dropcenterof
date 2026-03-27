import { Search, User, LogOut, Sun, Moon, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/ThemeProvider";
import { NotificationCenter } from "@/components/NotificationCenter";

interface TopbarProps {
  portalLabel: string;
  userName?: string;
}

export function Topbar({ portalLabel, userName }: TopbarProps) {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const displayName = userName || user?.user_metadata?.name || user?.email?.split("@")[0] || "Usuário";

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="h-16 glass-topbar flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4 pl-12 lg:pl-0">
        <h2 className="font-display font-semibold text-foreground text-lg">{portalLabel}</h2>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Search */}
        <button className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl glass text-muted-foreground hover:text-foreground transition-colors text-sm">
          <Search className="w-4 h-4" />
          <span className="hidden md:inline">Buscar...</span>
          <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded-md border border-border bg-background/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-xl hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
          title={`Tema: ${theme === "light" ? "Claro" : theme === "dark" ? "Escuro" : "Sistema"}`}
        >
          <ThemeIcon className="w-[18px] h-[18px]" />
        </button>

        {/* Notifications */}
        <NotificationCenter />

        {/* User */}
        <Link
          to="/configuracoes"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-secondary/50 transition-colors"
        >
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="hidden md:inline text-sm font-medium text-foreground">{displayName}</span>
        </Link>

        {/* Logout */}
        <button
          onClick={() => signOut()}
          className="p-2 rounded-xl hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-destructive"
          title="Sair"
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  );
}