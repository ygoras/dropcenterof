import { useState } from "react";
import { Bell, Wallet, AlertTriangle, CheckCircle2, Info, ShoppingCart, X, CheckCheck } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  low_balance: { icon: Wallet, color: "text-warning", bg: "bg-warning/10" },
  order_blocked: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  payment_confirmed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  orders_released: { icon: ShoppingCart, color: "text-primary", bg: "bg-primary/10" },
  info: { icon: Info, color: "text-muted-foreground", bg: "bg-secondary" },
};

function formatTimeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleClick = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
    if (n.action_url) {
      navigate(n.action_url);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-display font-semibold text-foreground text-sm">Notificações</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Marcar todas
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 divide-y divide-border/50">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma notificação</p>
                  <p className="text-xs mt-0.5">Você será avisado sobre eventos importantes.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const config = typeConfig[n.type] ?? typeConfig.info;
                  const Icon = config.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors",
                        !n.read && "bg-primary/[0.03]"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                        <Icon className={cn("w-4 h-4", config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-sm font-medium truncate", n.read ? "text-muted-foreground" : "text-foreground")}>
                            {n.title}
                          </p>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">{formatTimeAgo(n.created_at)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
