/**
 * Centralized formatting utilities.
 * Import these instead of defining local formatDate/formatCurrency in each page.
 */

export const formatDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

export const formatDateTime = (d: string | null | undefined): string => {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export const formatCurrency = (v: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
