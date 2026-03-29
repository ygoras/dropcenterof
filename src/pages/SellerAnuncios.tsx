import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/formatters";
import {
  ClipboardList,
  Plus,
  Search,
  Store,
  AlertTriangle,
  Lock,
  Crown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMlListings } from "@/hooks/useMlListings";
import { useMlCredentials } from "@/hooks/useMlCredentials";
import { useProducts } from "@/hooks/useProducts";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { useSellerPlan } from "@/hooks/useSellerPlan";
import { Link } from "react-router-dom";
import { AnunciosStats } from "@/components/anuncios/AnunciosStats";
import { AnunciosTable } from "@/components/anuncios/AnunciosTable";
import { CreateListingDialog } from "@/components/anuncios/CreateListingDialog";
import { EditPriceDialog } from "@/components/anuncios/EditPriceDialog";
import { toast } from "sonner";

const SellerAnuncios = () => {
  const { listings, loading, createListing, deleteListing, syncListing, updateListingPrice, refreshListing } = useMlListings();
  const { credentials, isConnected } = useMlCredentials();
  const { products } = useProducts();
  const { profile } = useProfile();
  const { plan, canCreateListing, remainingListings, isBlocked, maxListings, activeListingsCount } = useSellerPlan();
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [salesByProduct, setSalesByProduct] = useState<Record<string, number>>({});
  const [editingListing, setEditingListing] = useState<string | null>(null);

  // Fetch sales count per product
  useEffect(() => {
    if (!profile?.tenant_id) return;
    const fetchSales = async () => {
      try {
        const data = await api.get<any[]>(`/api/orders?tenant_id=${profile.tenant_id!}&fields=items&exclude_status=cancelled`);
        if (data) {
          const counts: Record<string, number> = {};
          data.forEach((order: any) => {
            const items = order.items as Array<{ product_id: string; quantity: number }>;
            items?.forEach((item) => {
              counts[item.product_id] = (counts[item.product_id] || 0) + item.quantity;
            });
          });
          setSalesByProduct(counts);
        }
      } catch {}
    };
    fetchSales();
  }, [profile?.tenant_id]);

  const activeProducts = products.filter((p) => p.status === "active");

  const filtered = listings.filter((l) => {
    const matchSearch =
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      (l.product_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (l.ml_item_id ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStore = storeFilter === "all" || l.ml_credential_id === storeFilter;
    return matchSearch && matchStore;
  });


  // Not connected state
  if (!isConnected && !loading) {
    return (
      <div className="space-y-6 max-w-3xl animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Meus Anúncios
          </h1>
        </div>
        <div className="bg-card rounded-xl border border-border shadow-card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-warning" />
          </div>
          <h3 className="font-display font-semibold text-foreground text-lg">
            Conecte o Mercado Livre primeiro
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Para criar e gerenciar anúncios, você precisa conectar sua conta do Mercado Livre.
          </p>
          <Link
            to="/seller/integracao"
            className="inline-flex items-center gap-2 mt-4 h-10 px-5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Store className="w-4 h-4" />
            Ir para Integração
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Meus Anúncios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie seus anúncios no Mercado Livre
          </p>
        </div>
        <button
          onClick={() => {
            if (isBlocked) {
              toast.error("Sua assinatura está bloqueada. Entre em contato com o suporte.");
              return;
            }
            if (!canCreateListing) {
              toast.error(`Você atingiu o limite de ${maxListings} anúncios ativos do plano ${plan?.name ?? ""}.`);
              return;
            }
            setShowCreate(true);
          }}
          disabled={isBlocked}
          className="h-10 px-5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity self-start disabled:opacity-50"
        >
          {isBlocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          Novo Anúncio
        </button>
      </div>

      {/* Plan Info Banner */}
      {plan && (
        <div className={`rounded-xl border p-4 flex items-center justify-between ${isBlocked ? 'bg-destructive/5 border-destructive/30' : 'bg-primary/5 border-primary/20'}`}>
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-primary" />
            <div>
              <span className="text-sm font-semibold text-foreground">Plano {plan.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {activeListingsCount}/{maxListings ?? "∞"} anúncios ativos
              </span>
            </div>
          </div>
          {remainingListings !== null && remainingListings <= 3 && remainingListings > 0 && (
            <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-1 rounded-md">
              {remainingListings} restante{remainingListings !== 1 ? "s" : ""}
            </span>
          )}
          {remainingListings === 0 && (
            <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-md">
              Limite atingido
            </span>
          )}
          {isBlocked && (
            <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-md flex items-center gap-1">
              <Lock className="w-3 h-3" /> Bloqueado
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <AnunciosStats
        total={listings.length}
        active={listings.filter((l) => l.status === "active").length}
        drafts={listings.filter((l) => l.status === "draft").length}
        underReview={listings.filter((l) => l.status === "under_review").length}
        totalSales={listings.reduce((sum, l) => sum + (salesByProduct[l.product_id] || 0), 0)}
      />

      {/* Search & Store Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, produto ou ID ML..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
        {credentials.length > 1 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px]">
              <Store className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Todas as lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {credentials.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.store_name || c.ml_nickname || c.ml_user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium">Nenhum anúncio encontrado</p>
          <p className="text-sm mt-1">Crie seu primeiro anúncio a partir do catálogo</p>
        </div>
      ) : (
        <AnunciosTable
          listings={filtered}
          salesByProduct={salesByProduct}
          onSync={syncListing}
          onDelete={deleteListing}
          onRefresh={refreshListing}
          onEditPrice={(id, price) => {
            setEditingListing(id);
          }}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Create Dialog */}
      <CreateListingDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        activeProducts={activeProducts}
        stores={credentials.map(c => ({ id: c.id, store_name: c.store_name, ml_nickname: c.ml_nickname }))}
        onCreateListing={async (data) => { await createListing(data); }}
        formatCurrency={formatCurrency}
      />

      {/* Edit Price Dialog */}
      <EditPriceDialog
        listingId={editingListing}
        listings={listings}
        products={products}
        onClose={() => setEditingListing(null)}
        onUpdatePrice={async (id, price) => { await updateListingPrice(id, price); }}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default SellerAnuncios;
