import {
  Package,
  ExternalLink,
  Upload,
  Pause,
  Play,
  RefreshCw,
  Edit3,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
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

interface Listing {
  id: string;
  title: string;
  price: number;
  status: string;
  ml_item_id: string | null;
  product_id: string;
  product_name?: string | null;
  product_sku?: string | null;
  product_images?: string[] | null;
  attributes?: Record<string, unknown> | null;
  category_id?: string | null;
  store_name?: string;
}

interface AnunciosTableProps {
  listings: Listing[];
  salesByProduct: Record<string, number>;
  onSync: (id: string, action: string) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  onEditPrice: (id: string, currentPrice: number) => void;
  formatCurrency: (v: number) => string;
}

function getListingFinancials(listing: Listing) {
  const attrs = (listing.attributes || {}) as Record<string, unknown>;
  const saleFee = typeof attrs._ml_sale_fee === "number" ? attrs._ml_sale_fee : null;
  const shippingCost = typeof attrs._ml_shipping_cost === "number" ? attrs._ml_shipping_cost : null;
  const netAmount = typeof attrs._ml_net_amount === "number" ? attrs._ml_net_amount : null;
  const listingTypeId = typeof attrs._listing_type_id === "string" ? attrs._listing_type_id : null;
  return { saleFee, shippingCost, netAmount, listingTypeId };
}

export function AnunciosTable({
  listings,
  salesByProduct,
  onSync,
  onDelete,
  onRefresh,
  onEditPrice,
  formatCurrency,
}: AnunciosTableProps) {
  const typeLabels: Record<string, string> = {
    gold_pro: "Premium",
    gold_special: "Clássico",
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Produto</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Título ML</th>
              <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Loja</th>
              <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Tipo</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Preço</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Comissão ML</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Frete</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Você Recebe</th>
              <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Vendas</th>
              <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">ID ML</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const { saleFee, shippingCost, netAmount, listingTypeId } = getListingFinancials(listing);
              return (
                <tr key={listing.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.product_images && listing.product_images.length > 0 ? (
                        <img src={listing.product_images[0]} alt="" className="w-8 h-8 rounded object-cover border border-border" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-secondary/50 flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground line-clamp-1">{listing.product_name || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{listing.product_sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground line-clamp-1">{listing.title}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                      {listing.store_name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      listingTypeId === "gold_pro" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {typeLabels[listingTypeId || ""] || listingTypeId || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(listing.price)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {saleFee !== null ? (
                      <p className="text-sm text-destructive">-{formatCurrency(saleFee)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {shippingCost !== null ? (
                      <p className="text-sm text-warning">{shippingCost > 0 ? `-${formatCurrency(shippingCost)}` : "Grátis"}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {netAmount !== null ? (
                      <p className="text-sm font-semibold text-success">{formatCurrency(netAmount)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-foreground">{salesByProduct[listing.product_id] || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={listing.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {listing.ml_item_id ? (
                      <a href={`https://www.mercadolivre.com.br/p/${listing.ml_item_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        {listing.ml_item_id}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!listing.ml_item_id && listing.status === "draft" && (
                        <button onClick={() => onSync(listing.id, "publish")} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Publicar no ML">
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      {listing.ml_item_id && listing.status === "active" && (
                        <button onClick={() => onSync(listing.id, "pause")} className="p-1.5 rounded-lg text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors" title="Pausar anúncio">
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      {listing.ml_item_id && listing.status === "paused" && (
                        <button onClick={() => onSync(listing.id, "activate")} className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors" title="Reativar anúncio">
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {listing.ml_item_id && (
                        <button onClick={() => onRefresh(listing.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors" title="Sincronizar dados do ML">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {listing.ml_item_id && (
                        <button onClick={() => onEditPrice(listing.id, listing.price)} className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors" title="Editar preço">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Encerrar anúncio?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O anúncio "{listing.title}" será encerrado no Mercado Livre e removido da plataforma. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(listing.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
