
export enum UserRole {
  DEV_ADMIN = 'DEV_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN', // Tenant Owner
  ADMIN = 'ADMIN' // Tenant Employee
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN_LEAD = 'OPEN_LEAD',
  NO_ANSWER = 'NO_ANSWER',
  REJECTED = 'REJECTED',
  HOLD = 'HOLD',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  TRANSFER = 'TRANSFER', // Added for forward logistics hub transfer
  DELIVERY = 'DELIVERY',
  RESIDUAL = 'RESIDUAL',
  REARRANGE = 'REARRANGE',
  RETURNED = 'RETURNED', 
  RETURN_TRANSFER = 'RETURN_TRANSFER',
  RETURN_AS_ON_SYSTEM = 'RETURN_AS_ON_SYSTEM',
  RETURN_HANDOVER = 'RETURN_HANDOVER',
  DELIVERED = 'DELIVERED',
  RETURN_COMPLETED = 'RETURN_COMPLETED'
}

export enum CustomerStatus {
  NEW = 'NEW',
  REGULAR = 'REGULAR',
  RISK_ORANGE = 'RISK_ORANGE',
  RISK_RED = 'RISK_RED'
}

export enum CourierMode {
  STANDARD = 'STANDARD',
  EXISTING_WAYBILL = 'EXISTING_WAYBILL'
}

export interface DomainRecord {
  host: string;
  type: 'CNAME' | 'A';
  isActive: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  mongoUri: string;
  isActive: boolean;
  domain?: string; 
  domainRecords?: DomainRecord[]; 
  settings: TenantSettings;
}

export interface TenantSettings {
  shopName: string;
  logoUrl?: string;
  shopAddress: string;
  shopPhone: string;
  courierApiKey: string;
  courierApiUrl: string;
  courierClientId: string;
  courierMode: CourierMode;
  showBillQr: boolean;
  cloudflareToken?: string; // New field for domain sync
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  tenantId?: string;
  permissions?: string[]; // Array of page IDs
}

export interface StockBatch {
  id: string;
  quantity: number; // Current remaining
  originalQuantity?: number; // Initial added amount
  buyingPrice: number;
  createdAt: string;
  isReturn?: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  price: number;
  batches: StockBatch[];
  stock?: number;
}

export interface OrderLog {
  id: string;
  message: string;
  timestamp: string;
  user: string;
}

export interface Order {
  id: string;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  customerAddress: string;
  customerCity?: string;
  parcelWeight?: string;
  parcelDescription?: string;
  items: { productId: string; quantity: number; price: number; name: string }[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  confirmedAt?: string;
  shippedAt?: string; 
  deliveredAt?: string;
  returnCompletedAt?: string; // New field for restocking analytics
  trackingNumber?: string;
  courierStatus?: string;
  isPrinted: boolean;
  openedBy?: string;
  logs?: OrderLog[];
}
