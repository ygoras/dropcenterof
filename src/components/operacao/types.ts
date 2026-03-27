export interface OrderTask {
  order_id: string;
  order_status: string;
  order_number: string;
  created_at: string;
  tenant_name: string;
  customer_name: string;
  items: OrderItem[];
  picking_task_id?: string;
  picking_status?: string;
  shipment_id?: string;
  ml_shipment_id?: string;
  tracking_code?: string;
  label_url?: string;
}

export interface OrderItem {
  product_name: string;
  product_sku: string;
  quantity: number;
  image_url?: string;
}
