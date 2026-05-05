import { BarChart3, DollarSign, ShoppingCart, Package, TrendingUp, Wallet, Truck, Store } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ReportFilters } from "@/components/relatorios/ReportFilters";
import { SalesBySellerTab } from "@/components/relatorios/SalesBySellerTab";
import { SalesBySkuTab } from "@/components/relatorios/SalesBySkuTab";
import { SalesByCategoryTab } from "@/components/relatorios/SalesByCategoryTab";
import { ProductivityTab } from "@/components/relatorios/ProductivityTab";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/formatters";

const Relatorios = () => {
  const { data, loading, filters, setFilters, tenants, categories } = useAnalytics();

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Relatórios & BI
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Análises de vendas, produtividade e desempenho</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Receita do admin = atacado vendido aos vendedores (sell_price × qty) */}
          <StatCard
            title="Receita Admin"
            value={formatCurrency(data.totals.revenue)}
            icon={<DollarSign className="w-5 h-5" />}
            change="Atacado (sell_price)"
          />
          {/* Custo real = cost_price × qty (inclui logística embutida) */}
          <StatCard
            title="Custo Real"
            value={formatCurrency(data.totals.cost)}
            icon={<Package className="w-5 h-5" />}
            changeType="negative"
            change="Inclui logística"
          />
          {/* Lucro atacado = receita − custo real */}
          <StatCard
            title="Lucro Atacado"
            value={formatCurrency(data.totals.net)}
            icon={<TrendingUp className="w-5 h-5" />}
            changeType={data.totals.net >= 0 ? "positive" : "negative"}
            change={`Margem ${data.totals.revenue > 0 ? ((data.totals.net / data.totals.revenue) * 100).toFixed(1) : 0}%`}
          />
          {/* Logística — só mostra se houver dado */}
          {data.totals.logisticsCost !== undefined && data.totals.logisticsCost > 0 && (
            <StatCard
              title="Logística"
              value={formatCurrency(data.totals.logisticsCost)}
              icon={<Truck className="w-5 h-5" />}
              changeType="negative"
              change="Embutida no custo"
            />
          )}
          {/* Informacionais (não somam pro lucro do admin) */}
          <StatCard
            title="GMV Vendedores"
            value={formatCurrency(data.totals.gmv ?? 0)}
            icon={<Store className="w-5 h-5" />}
            change="O que vendedores faturaram"
          />
          <StatCard
            title="Taxas ML pagas"
            value={formatCurrency(data.totals.mlFees ?? data.totals.fees ?? 0)}
            icon={<Wallet className="w-5 h-5" />}
            change="Cobradas dos vendedores"
          />
          <StatCard
            title="Pedidos"
            value={data.totals.orders}
            icon={<ShoppingCart className="w-5 h-5" />}
          />
          <StatCard
            title="Ticket Médio"
            value={formatCurrency(data.totals.avgTicket)}
            icon={<DollarSign className="w-5 h-5" />}
            change="Por pedido GMV"
          />
        </div>
      )}

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        tenants={tenants}
        categories={categories}
        showTenantFilter={true}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <Tabs defaultValue="sellers" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="sellers">Por Vendedor</TabsTrigger>
            <TabsTrigger value="sku">Por SKU</TabsTrigger>
            <TabsTrigger value="category">Por Categoria</TabsTrigger>
            <TabsTrigger value="productivity">Produtividade</TabsTrigger>
          </TabsList>

          <TabsContent value="sellers">
            <SalesBySellerTab data={data.salesBySeller} dailyTrend={data.dailyTrend} />
          </TabsContent>
          <TabsContent value="sku">
            <SalesBySkuTab data={data.salesBySku} />
          </TabsContent>
          <TabsContent value="category">
            <SalesByCategoryTab data={data.salesByCategory} />
          </TabsContent>
          <TabsContent value="productivity">
            <ProductivityTab data={data.productivity} operators={data.operatorProductivity} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};

export default Relatorios;
