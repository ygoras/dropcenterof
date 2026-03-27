export type ProductStatus = 'active' | 'inactive' | 'draft';
export type ItemCondition = 'new' | 'used' | 'refurbished';

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  ml_category_id: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  cost_price: number;
  sell_price: number;
  weight_kg: number | null;
  dimensions: { length: number; width: number; height: number } | null;
  images: string[];
  status: ProductStatus;
  ml_category_id: string | null;
  attributes: Record<string, unknown>;
  condition: ItemCondition;
  gtin: string | null;
  warranty_type: string | null;
  warranty_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithStock extends Product {
  category_name: string | null;
  stock_quantity: number;
  stock_reserved: number;
  stock_available: number;
  stock_min: number;
  low_stock: boolean;
}

export interface Stock {
  id: string;
  product_id: string;
  quantity: number;
  reserved: number;
  min_stock: number;
  location: string | null;
  last_sync_at: string | null;
  updated_at: string;
}
