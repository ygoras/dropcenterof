export type AppRole = 'admin' | 'manager' | 'seller' | 'viewer' | 'operator';
export type TenantStatus = 'active' | 'suspended' | 'trial';
export type ProductStatus = 'active' | 'inactive' | 'draft';
export type OrderStatus = 'pending' | 'pending_credit' | 'approved' | 'invoiced' | 'picking' | 'packing' | 'labeled' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type SubscriptionStatus = 'active' | 'overdue' | 'blocked' | 'cancelled';
export type PaymentStatus = 'pending' | 'confirmed' | 'expired' | 'refunded';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  document: string | null;
  status: TenantStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  cost_price: number;
  sell_price: number;
  weight_kg: number | null;
  dimensions: { length: number; width: number; height: number } | null;
  images: string[];
  status: ProductStatus;
  ml_category_id: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Stock {
  id: string;
  product_id: string;
  tenant_id: string;
  quantity: number;
  reserved: number;
  min_stock: number;
  location: string | null;
  last_sync_at: string | null;
  updated_at: string;
}

export interface AvailableStock {
  id: string;
  product_id: string;
  tenant_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  min_stock: number;
  low_stock: boolean;
  location: string | null;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price: number;
  description: string | null;
  max_products: number | null;
  max_listings: number | null;
  features: string[];
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_day: number;
  current_period_start: string;
  current_period_end: string;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  subscription_id: string;
  tenant_id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: PaymentStatus;
  pix_code: string | null;
  pix_qr_url: string | null;
  payment_gateway_id: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
