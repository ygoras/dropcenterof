// ML shipping mode → human readable label
// Values from ML API: me1, me2, custom, not_specified, fulfillment, etc.
export const shippingModeLabels: Record<string, string> = {
  me1: "Mercado Envios 1",
  me2: "Mercado Envios 2",
  me2_full: "Full",
  fulfillment: "Full",
  custom: "Personalizado",
  not_specified: "Nao especificado",
};

export function getShippingModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  return shippingModeLabels[mode] || mode;
}

export function getShippingModeColor(mode: string | null | undefined): string {
  if (!mode) return "bg-secondary text-muted-foreground border-border";
  if (mode === "me2") return "bg-blue-500/10 text-blue-500 border-blue-500/30";
  if (mode === "me1") return "bg-cyan-500/10 text-cyan-500 border-cyan-500/30";
  if (mode === "me2_full" || mode === "fulfillment") return "bg-purple-500/10 text-purple-500 border-purple-500/30";
  if (mode === "custom") return "bg-orange-500/10 text-orange-500 border-orange-500/30";
  return "bg-secondary text-muted-foreground border-border";
}
