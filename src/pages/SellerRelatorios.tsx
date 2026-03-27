import { BarChart3, DollarSign, ShoppingCart, Package, TrendingUp, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ReportFilters } from "@/components/relatorios/ReportFilters";
import { SalesBySkuTab } from "@/components/relatorios/SalesBySkuTab";
import { SalesByCategoryTab } from "@/components/relatorios/SalesByCategoryTab";
import { StatCard } from "@/components/StatCard";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const SellerRelatorios = () => {
  const { data, loading, filters, setFilters, categories } = useAnalytics();

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Meus Relatórios
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Análise financeira completa dos seus produtos</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard title="Faturamento" value={formatCurrency(data.totals.revenue)} icon={<DollarSign className="w-5 h-5" />} />
          <StatCard title="Custo" value={formatCurrency(data.totals.cost)} icon={<Package className="w-5 h-5" />} changeType="negative" change="Produtos" />
          <StatCard title="Frete" value={formatCurrency(data.totals.shipping)} icon={<ShoppingCart className="w-5 h-5" />} changeType="negative" change="Envios" />
          <StatCard title="Taxas ML" value={formatCurrency(data.totals.fees)} icon={<Wallet className="w-5 h-5" />} changeType="negative" change="Comissões" />
          <StatCard title="Você Recebe" value={formatCurrency(data.totals.net)} icon={<TrendingUp className="w-5 h-5" />} changeType={data.totals.net >= 0 ? "positive" : "negative"} change={`Margem ${data.totals.revenue > 0 ? ((data.totals.net / data.totals.revenue) * 100).toFixed(1) : 0}%`} />
          <StatCard title="Pedidos" value={data.totals.orders} icon={<ShoppingCart className="w-5 h-5" />} />
        </div>
      )}

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        tenants={[]}
        categories={categories}
        showTenantFilter={false}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <Tabs defaultValue="sku" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="sku">Por SKU</TabsTrigger>
            <TabsTrigger value="category">Por Categoria</TabsTrigger>
          </TabsList>

          <TabsContent value="sku">
            <SalesBySkuTab data={data.salesBySku} />
          </TabsContent>
          <TabsContent value="category">
            <SalesByCategoryTab data={data.salesByCategory} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};

export default SellerRelatorios;
