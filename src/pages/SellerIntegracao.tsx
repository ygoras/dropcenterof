import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Store,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Clock,
  ShieldCheck,
  Plus,
  Pencil,
  Crown,
  Lock,
} from "lucide-react";
import { useMlCredentials, type MlCredential } from "@/hooks/useMlCredentials";
import { useSellerPlan } from "@/hooks/useSellerPlan";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SellerIntegracao = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { credentials, loading, isConnected, startOAuth, disconnect, updateStoreName, refetch } = useMlCredentials();
  const { plan, canConnectStore, maxStores, connectedStores, isBlocked } = useSellerPlan();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState<MlCredential | null>(null);
  const [storeName, setStoreName] = useState("");

  // Handle redirect from OAuth success
  useEffect(() => {
    if (searchParams.get("ml_connected") === "true") {
      const nickname = searchParams.get("nickname") || "";
      toast.success(`Conta ${nickname} conectada com sucesso!`);
      refetch();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleConnect = async () => {
    if (!canConnectStore) {
      toast.error(`Você atingiu o limite de ${maxStores} loja(s) do plano ${plan?.name ?? ""}.`);
      return;
    }
    setConnecting(true);
    try {
      await startOAuth();
      toast.info("Uma janela foi aberta para autorizar o Mercado Livre.");
    } catch (err: any) {
      toast.error("Erro ao iniciar conexão: " + err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (credentialId: string) => {
    setDisconnecting(credentialId);
    try {
      const result = await disconnect(credentialId);
      if (result?.error) {
        toast.error("Erro ao desconectar");
      } else {
        toast.success("Conta desconectada com sucesso");
      }
    } catch {
      toast.error("Erro ao desconectar");
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSaveStoreName = async () => {
    if (!editingStore) return;
    await updateStoreName(editingStore.id, storeName);
    setEditingStore(null);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-card rounded-xl border border-border p-8 h-48 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="w-6 h-6 text-primary" />
            Minhas Lojas Mercado Livre
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conecte e gerencie suas contas do Mercado Livre
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting || isBlocked || !canConnectStore}
          className="h-10 px-5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
        >
          {isBlocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {connecting ? "Abrindo..." : "Conectar Nova Loja"}
        </button>
      </div>

      {/* Plan Info */}
      {plan && (
        <div className={`rounded-xl border p-4 flex items-center justify-between ${isBlocked ? 'bg-destructive/5 border-destructive/30' : 'bg-primary/5 border-primary/20'}`}>
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-primary" />
            <div>
              <span className="text-sm font-semibold text-foreground">Plano {plan.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {connectedStores}/{maxStores ?? "∞"} lojas conectadas
              </span>
            </div>
          </div>
          {!canConnectStore && !isBlocked && (
            <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-1 rounded-md">
              Limite de lojas atingido
            </span>
          )}
        </div>
      )}

      {/* Connected Stores */}
      {credentials.length > 0 ? (
        <div className="space-y-4">
          {credentials.map((cred) => {
            const isExpired = new Date(cred.expires_at) < new Date();
            const displayName = cred.store_name || cred.ml_nickname || cred.ml_user_id;

            return (
              <div key={cred.id} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                {/* Status Header */}
                <div className={`px-6 py-3 border-b border-border flex items-center justify-between ${
                  isExpired ? "bg-warning/5" : "bg-success/5"
                }`}>
                  <div className="flex items-center gap-2">
                    {isExpired ? (
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    )}
                    <span className={`text-sm font-semibold ${isExpired ? "text-warning" : "text-success"}`}>
                      {isExpired ? "Token Expirado" : "Conectada"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium bg-secondary/50 px-2 py-0.5 rounded-full">
                    {displayName}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  {/* Store Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                      <Store className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Nome da Loja</p>
                        <p className="text-sm font-semibold text-foreground">{cred.store_name || "Sem nome"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                      <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Conta ML</p>
                        <p className="text-sm font-semibold text-foreground">{cred.ml_nickname || cred.ml_user_id}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                      <Clock className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Token expira em</p>
                        <p className={`text-sm font-semibold ${isExpired ? "text-destructive" : "text-foreground"}`}>
                          {formatDate(cred.expires_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                      <Link2 className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Conectado em</p>
                        <p className="text-sm font-semibold text-foreground">{formatDate(cred.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => {
                        setEditingStore(cred);
                        setStoreName(cred.store_name || "");
                      }}
                      className="h-9 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Renomear
                    </button>

                    {isExpired && (
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${connecting ? "animate-spin" : ""}`} />
                        Reconectar
                      </button>
                    )}

                    <button
                      onClick={refetch}
                      className="h-9 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Atualizar
                    </button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="h-9 px-4 rounded-lg border border-destructive/30 text-destructive text-sm font-medium flex items-center gap-2 hover:bg-destructive/5 transition-colors">
                          <Unlink className="w-3.5 h-3.5" />
                          Desconectar
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desconectar {displayName}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá a conexão com a conta <strong>{cred.ml_nickname || cred.ml_user_id}</strong>.
                            Seus anúncios existentes no ML não serão afetados, mas a sincronização será interrompida.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(cred.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={disconnecting === cred.id}
                          >
                            {disconnecting === cred.id ? "Desconectando..." : "Sim, desconectar"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-card rounded-xl border border-border shadow-card p-8">
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
              <Store className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground text-lg">
                Conecte sua primeira loja
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Ao conectar, você poderá publicar anúncios diretamente do catálogo e receber pedidos automaticamente.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting || isBlocked}
              className="h-11 px-6 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 mx-auto"
            >
              <ExternalLink className={`w-4 h-4 ${connecting ? "animate-spin" : ""}`} />
              {connecting ? "Abrindo autorização..." : "Conectar Mercado Livre"}
            </button>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!editingStore} onOpenChange={(open) => !open && setEditingStore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear Loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Conta ML</Label>
              <p className="text-sm text-muted-foreground">{editingStore?.ml_nickname || editingStore?.ml_user_id}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeName">Nome personalizado</Label>
              <Input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Loja Principal, Outlet, Premium..."
              />
            </div>
            <button
              onClick={handleSaveStoreName}
              className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <div className="bg-info/5 border border-info/20 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-info" />
          Como funciona a integração?
        </h4>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>• Conecte uma ou mais contas ML conforme seu plano</li>
          <li>• Dê um nome personalizado para cada loja</li>
          <li>• Anúncios e pedidos são separados por loja automaticamente</li>
          <li>• Os tokens são renovados automaticamente antes de expirar</li>
          <li>• O limite de anúncios ativos é compartilhado entre todas as lojas</li>
        </ul>
      </div>
    </div>
  );
};

export default SellerIntegracao;
