import { useState, useEffect, useCallback } from "react";
import { Calculator, AlertTriangle, Truck, Loader2, Info, RefreshCw } from "lucide-react";
import { api } from "@/lib/apiClient";

interface ProductDimensions {
  length: number;
  width: number;
  height: number;
}

interface MlPriceCalculatorProps {
  basePrice: number;
  onFinalPriceChange?: (finalPrice: number) => void;
  compact?: boolean;
  listingType?: string;
  onFreeShippingChange?: (enabled: boolean) => void;
  productDimensions?: ProductDimensions | null;
  productWeightKg?: number | null;
  productCondition?: string;
}

interface PriceBreakdown {
  basePrice: number;
  markupAmount: number;
  taxAmount: number;
  shippingCost: number;
  mlFee: number;
  finalPrice: number;
  profit: number;
  profitMargin: number;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LISTING_COMMISSIONS: Record<string, number> = {
  gold_pro: 17,
  gold_special: 12,
};

export function MlPriceCalculator({
  basePrice,
  onFinalPriceChange,
  compact = false,
  listingType,
  onFreeShippingChange,
  productDimensions,
  productWeightKg,
  productCondition,
}: MlPriceCalculatorProps) {
  const defaultCommission = listingType ? (LISTING_COMMISSIONS[listingType] || 11) : 11;
  const [markup, setMarkup] = useState("30");
  const [taxPercent, setTaxPercent] = useState("0");
  const [mlCommission, setMlCommission] = useState(String(defaultCommission));
  const [freeShipping, setFreeShipping] = useState(false);
  const [shippingCost, setShippingCost] = useState(0);
  const [fetchingShipping, setFetchingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [billableWeight, setBillableWeight] = useState<number | null>(null);

  // Real ML fee from API
  const [realMlFee, setRealMlFee] = useState<number | null>(null);
  const [fetchingFees, setFetchingFees] = useState(false);

  const hasDimensions = productDimensions && productWeightKg && productWeightKg > 0;

  const isPremium = listingType === 'gold_pro';

  useEffect(() => {
    if (listingType) {
      setMlCommission(String(LISTING_COMMISSIONS[listingType] || 11));
    }
    // Premium always has free shipping
    if (isPremium) {
      setFreeShipping(true);
    }
  }, [listingType, isPremium]);

  useEffect(() => {
    onFreeShippingChange?.(freeShipping);
  }, [freeShipping]);

  // Fetch real commission from ML listing_prices API
  const fetchRealFees = useCallback(async (price: number) => {
    if (price <= 0) return;
    setFetchingFees(true);
    try {
      const data = await api.post<{ sale_fee_amount?: number }>("/api/ml/sync", {
        action: "get_fees",
        price: Math.round(price * 100) / 100,
        listing_type_id: listingType || "gold_special",
      });
      if (data?.sale_fee_amount) {
        setRealMlFee(data.sale_fee_amount);
      }
    } catch (err) {
      console.warn("Could not fetch real ML fees:", err);
    } finally {
      setFetchingFees(false);
    }
  }, [listingType]);

  // Fetch shipping cost from ML API when free shipping is toggled on
  const fetchShippingCost = useCallback(async () => {
    if (!freeShipping || !hasDimensions) {
      setShippingCost(0);
      setShippingError(null);
      setBillableWeight(null);
      return;
    }

    setFetchingShipping(true);
    setShippingError(null);

    try {
      const markupVal = parseFloat(markup) || 0;
      const estimatedPrice = basePrice * (1 + markupVal / 100);

      const data = await api.post<{ error?: string; ml_error?: string; shipping_cost?: number; billable_weight?: number }>("/api/ml/shipping-cost", {
        dimensions: productDimensions,
        weight_kg: productWeightKg,
        item_price: estimatedPrice,
        listing_type_id: listingType || "gold_special",
        condition: productCondition || "new",
        free_shipping: true,
        logistic_type: "drop_off",
      });

      if (data?.error) {
        throw new Error(data.ml_error || data.error);
      }

      setShippingCost(data.shipping_cost || 0);
      setBillableWeight(data.billable_weight || null);
    } catch (err: any) {
      console.error("Error fetching shipping cost:", err);
      setShippingError(err.message || "Erro ao consultar custo de frete");
      setShippingCost(0);
    } finally {
      setFetchingShipping(false);
    }
  }, [freeShipping, hasDimensions, productDimensions, productWeightKg, listingType, productCondition, basePrice, markup]);

  useEffect(() => {
    fetchShippingCost();
  }, [fetchShippingCost]);

  const calcPrices = (): PriceBreakdown => {
    const markupVal = parseFloat(markup) || 0;
    const taxVal = parseFloat(taxPercent) || 0;
    const mlVal = parseFloat(mlCommission) || 0;
    const shipVal = freeShipping ? shippingCost : 0;

    const withMarkup = basePrice * (1 + markupVal / 100);
    const withTax = withMarkup * (1 + taxVal / 100);
    const withShipping = withTax + shipVal;
    const finalPrice = mlVal < 100 ? withShipping / (1 - mlVal / 100) : withShipping;

    // Use real ML fee if available, otherwise estimate from percentage
    const mlFee = realMlFee !== null ? realMlFee : (finalPrice - withShipping);
    const profit = finalPrice - basePrice - mlFee - (withMarkup * taxVal / 100) - shipVal;

    return {
      basePrice,
      markupAmount: withMarkup - basePrice,
      taxAmount: withTax - withMarkup,
      shippingCost: shipVal,
      mlFee,
      finalPrice,
      profit,
      profitMargin: finalPrice > 0 ? (profit / finalPrice) * 100 : 0,
    };
  };

  const prices = calcPrices();

  // Debounce fetching real fees when final price changes
  useEffect(() => {
    if (prices.finalPrice <= 0) return;
    const timer = setTimeout(() => {
      fetchRealFees(prices.finalPrice);
    }, 600);
    return () => clearTimeout(timer);
  }, [prices.finalPrice, fetchRealFees]);

  useEffect(() => {
    onFinalPriceChange?.(Math.round(prices.finalPrice * 100) / 100);
  }, [prices.finalPrice]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Calculadora de Preço ML</h3>
      </div>

      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Markup (%)</label>
          <input
            type="number"
            step="0.1"
            value={markup}
            onChange={(e) => { setMarkup(e.target.value); setRealMlFee(null); }}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Impostos (%)</label>
          <input
            type="number"
            step="0.1"
            value={taxPercent}
            onChange={(e) => { setTaxPercent(e.target.value); setRealMlFee(null); }}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Comissão ML (%)
            {fetchingFees && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
          </label>
          <input
            type="number"
            step="0.1"
            value={mlCommission}
            onChange={(e) => setMlCommission(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {realMlFee !== null
              ? `Comissão real da API: ${formatCurrency(realMlFee)}`
              : "Definido pelo tipo de anúncio selecionado"}
          </p>
        </div>
      </div>

      {/* Free Shipping Toggle */}
      <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
        <label className={`flex items-center gap-2 ${isPremium ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={freeShipping}
            onChange={(e) => !isPremium && setFreeShipping(e.target.checked)}
            disabled={isPremium}
            className="w-4 h-4 rounded border-input accent-primary"
          />
          <Truck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Frete Grátis</span>
          {isPremium && <span className="text-[10px] text-primary font-medium">(obrigatório no Premium)</span>}
        </label>
        <p className="text-[10px] text-muted-foreground">
          {isPremium
            ? "Anúncios Premium incluem frete grátis obrigatoriamente. O custo será embutido no preço final."
            : freeShipping
              ? "O custo do frete será consultado via API do ML e embutido no preço final."
              : "Frete pago pelo comprador. O custo real de envio será definido pelo ML após a publicação."}
        </p>

        {freeShipping && !hasDimensions && (
          <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-[10px] text-warning font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Cadastre as dimensões (cm) e peso (kg) do produto para calcular o frete automaticamente.
            </p>
          </div>
        )}

        {freeShipping && hasDimensions && (
          <div className="space-y-1.5">
            {fetchingShipping ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Consultando custo de frete na API do ML...
              </div>
            ) : shippingError ? (
              <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {shippingError}
                </p>
                <button
                  onClick={fetchShippingCost}
                  className="text-[10px] text-primary hover:underline mt-1"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-success/10 border border-success/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Custo estimado do frete (API ML)
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {formatCurrency(shippingCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Dimensões: {productDimensions!.height}×{productDimensions!.width}×{productDimensions!.length} cm
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Peso: {productWeightKg} kg
                    {billableWeight ? ` (faturável: ${billableWeight}g)` : ""}
                  </span>
                </div>
                <p className="text-[10px] text-warning flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Valor estimado. O custo real será definido pelo ML após publicação.
                </p>
                <button
                  onClick={fetchShippingCost}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Recalcular
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Price Breakdown */}
      <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Preço Base</span>
          <span className="text-foreground">{formatCurrency(prices.basePrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">+ Markup ({markup}%)</span>
          <span className="text-foreground">{formatCurrency(prices.markupAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">+ Impostos ({taxPercent}%)</span>
          <span className="text-foreground">{formatCurrency(prices.taxAmount)}</span>
        </div>
        {freeShipping ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Truck className="w-3 h-3" />
              + Frete Grátis (embutido)
            </span>
            <span className="text-foreground">{formatCurrency(prices.shippingCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Frete</span>
            <span className="text-info text-[10px] italic">Custo definido pelo ML após publicação</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            - Comissão ML ({mlCommission}%)
            {realMlFee !== null && (
              <span className="text-success ml-1 text-[10px]">✓ API</span>
            )}
          </span>
          <span className="text-destructive">-{formatCurrency(prices.mlFee)}</span>
        </div>
        <div className="border-t border-border pt-1.5 mt-1.5">
          <div className="flex justify-between font-semibold">
            <span className="text-foreground">Preço Final ML</span>
            <span className="text-primary text-sm">{formatCurrency(prices.finalPrice)}</span>
          </div>
          {freeShipping && (
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Truck className="w-3 h-3 text-success" />
                Anúncio com frete grátis
              </span>
            </div>
          )}
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Lucro estimado</span>
            <span className={`font-semibold ${prices.profit >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(prices.profit)} ({prices.profitMargin.toFixed(1)}%)
            </span>
          </div>

          {/* Você Recebe - net after fees */}
          <div className="flex justify-between mt-1 pt-1 border-t border-border">
            <span className="text-foreground font-semibold">Você Recebe</span>
            <span className="text-success font-bold text-sm">
              {formatCurrency(prices.finalPrice - prices.mlFee - (freeShipping ? prices.shippingCost : 0))}
            </span>
          </div>
        </div>
      </div>

      {!freeShipping && (
        <div className="p-2 rounded-lg bg-info/10 border border-info/20">
          <p className="text-[10px] text-info font-medium flex items-center gap-1">
            <Info className="w-3 h-3" />
            O custo de envio cobrado pelo ML será atualizado automaticamente após a publicação via webhook.
          </p>
        </div>
      )}

      {prices.profit < 0 && (
        <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Atenção: com esses parâmetros você terá prejuízo!
          </p>
        </div>
      )}
    </div>
  );
}
