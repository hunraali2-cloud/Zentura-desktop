export type UserRole = 'super_admin' | 'store_admin' | 'manager' | 'cashier';
export type PaymentMethod = 'cash' | 'card' | 'qr' | 'account' | 'online';
export type InvoiceStatus = 'completed' | 'voided' | 'refunded';
export type PlanType = 'monthly' | '6_months' | 'yearly';

export interface StoreSettings {
  id?: string;
  tenant_id?: string;
  store_name: string;
  store_admin_name?: string;
  store_address: string;
  store_phone: string;
  receipt_header_note: string;
  receipt_footer_note: string;
  tax_rate_percent: number;
  currency_symbol: string;
  enable_udhaar: boolean;
  bank_name?: string;
  account_number?: string;
  account_title?: string;
  easypaisa_number?: string;
  easypaisa_title?: string;
  qr_code_url?: string;
  store_logo_url?: string;
  updated_at?: string;
}

export interface ReturnRecord {
  id: string;
  tenant_id?: string;
  invoice_number: string;
  customer_detail: string;
  refund_amount: number;
  reason: string;
  processed_by: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  admin_name?: string;
  admin_email?: string;
  admin_phone?: string;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  pin_code?: string;
  rfid_tag?: string;
  created_at: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  tax_rate: number;
  badge_color: string;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  barcode: string;
  name: string;
  category_id?: string;
  cost_price: number;
  retail_price: number;
  stock_qty: number;
  min_threshold: number;
  image_url?: string;
  created_at: string;
}

export interface StockLog {
  id: string;
  tenant_id: string;
  product_id: string;
  cashier_id: string;
  change_qty: number;
  reason: string;
  locked: boolean;
  image_url?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  cashier_id: string;
  invoice_number: string;
  subtotal: number;
  tax: number;
  total: number;
  tendered: number;
  change: number;
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  items?: { product_id: string; qty: number; unit_price: number; name: string }[];
  cost_price_total?: number;
  voided_by?: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  tenant_id?: string;
  invoice_number: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  total_price: number;
}

export interface Attendance {
  id: string;
  tenant_id: string;
  user_id: string;
  clock_in: string;
  clock_out?: string;
  device_uuid?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  loyalty_points: number;
  credit_balance: number;
  created_at: string;
}

export interface License {
  id: string;
  tenant_id: string;
  machine_uuid?: string;
  license_key: string;
  plan_type?: PlanType;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  tenant_id: string;
  title: string;
  amount: number;
  category: string;
  notes?: string;
  cashier_name?: string;
  created_at: string;
}

export interface UdhaarLog {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  invoice_number?: string;
  type: 'generate' | 'wasool';
  amount: number;
  balance_after: number;
  cashier_name?: string;
  notes?: string;
  created_at: string;
}

