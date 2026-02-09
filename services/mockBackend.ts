
import { Order, OrderStatus, Product, Tenant, User, UserRole, CustomerStatus, TenantSettings, StockBatch, CourierMode } from '../types';

const API_BASE = '/api';

interface GetOrdersParams {
  tenantId: string;
  id?: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
}

class BackendService {
  private async request(path: string, method: string = 'GET', body?: any, params?: any) {
    const url = new URL(`${window.location.origin}${API_BASE}${path}`);
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, String(params[key]));
        }
      });
    }
    
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        if (contentType && contentType.includes("application/json")) {
           const errorData = await response.json();
           errorMsg = errorData.error || errorMsg;
        } else {
           const text = await response.text();
           console.error("Server returned non-JSON error:", text.slice(0, 200));
        }
        throw new Error(errorMsg);
      }

      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        const text = await response.text();
        console.error("Expected JSON but got:", text.slice(0, 100));
        throw new Error("Server configuration error: Expected JSON but received HTML.");
      }
    } catch (e: any) {
      console.error(`Backend API Failure [${path}]:`, e);
      throw e;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch { return false; }
  }

  async login(username: string, password?: string): Promise<User | null> {
    return await this.request('/login', 'POST', { username, password });
  }

  async getOrders(params: string | GetOrdersParams): Promise<{ data: Order[], total: number }> {
    const actualParams = typeof params === 'string' ? { tenantId: params } : params;
    const res = await this.request('/orders', 'GET', null, actualParams);
    
    if (actualParams.id) return { data: res ? [res] : [], total: res ? 1 : 0 };
    
    if (Array.isArray(res)) {
      return { data: res, total: res.length };
    }
    
    return { 
      data: res.data || [], 
      total: res.total || 0 
    };
  }

  async getOrder(orderId: string, tenantId: string): Promise<Order | undefined> {
    const res = await this.getOrders({ tenantId, id: orderId });
    return res.data[0];
  }

  async updateOrder(order: Order): Promise<void> {
    await this.request('/orders', 'POST', { order, tenantId: order.tenantId }, { tenantId: order.tenantId });
  }

  async deleteOrder(orderId: string, tenantId: string): Promise<void> {
    await this.request('/orders', 'DELETE', null, { id: orderId, tenantId });
  }

  async purgeOrders(tenantId: string): Promise<number> {
    const res = await this.request('/orders', 'DELETE', null, { tenantId, purge: 'true' });
    return res.count || 0;
  }
  
  async createOrders(orders: Order[]): Promise<void> {
    if (orders.length === 0) return;
    const tenantId = orders[0].tenantId;
    await this.request('/orders', 'POST', { orders, tenantId }, { tenantId });
  }

  async getProducts(tenantId: string): Promise<Product[]> {
    return this.request('/products', 'GET', null, { tenantId });
  }

  async updateProduct(product: Product): Promise<void> {
    await this.request('/products', 'POST', { product, tenantId: product.tenantId }, { tenantId: product.tenantId });
  }

  async deleteProduct(productId: string, tenantId: string): Promise<void> {
    await this.request('/products', 'DELETE', null, { id: productId, tenantId });
  }

  /**
   * FIFO STOCK REDUCTION LOGIC
   * Automatically iterates through batches from oldest to newest
   */
  async deductStockFIFO(tenantId: string, productId: string, quantityToDeduct: number): Promise<void> {
    const products = await this.getProducts(tenantId);
    const product = products.find(p => p.id === productId);
    
    if (!product) throw new Error("Product not found in registry.");
    
    let remainingToDeduct = quantityToDeduct;
    const updatedBatches = [...(product.batches || [])].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (let i = 0; i < updatedBatches.length; i++) {
        if (remainingToDeduct <= 0) break;
        
        const batch = updatedBatches[i];
        if (batch.quantity >= remainingToDeduct) {
            batch.quantity -= remainingToDeduct;
            remainingToDeduct = 0;
        } else {
            remainingToDeduct -= batch.quantity;
            batch.quantity = 0;
        }
    }

    // IMPORTANT: Do NOT filter out zero quantity batches.
    // Keeping them ensures 'originalQuantity' is preserved for history calculations.
    // The UI will filter them out for 'Live Stock' view.
    
    await this.updateProduct({
        ...product,
        batches: updatedBatches
    });
  }

  async getTenants(): Promise<Tenant[]> {
    return this.request('/tenants', 'GET');
  }
  
  async getTenant(tenantId: string): Promise<Tenant | undefined> {
    const tenants = await this.getTenants();
    return tenants.find(t => t.id === tenantId);
  }

  async updateTenant(tenant: Tenant, adminEmail?: string, adminPass?: string): Promise<void> {
    const payload: any = { tenant };
    if (adminEmail || adminPass) {
        payload.adminUser = { username: adminEmail, password: adminPass };
    }
    await this.request('/tenants', 'PUT', payload);
  }

  async createTenant(formData: any): Promise<void> {
    const tenant = {
      id: formData.name,
      name: formData.name,
      mongoUri: formData.mongoUri,
      domain: formData.domain || '',
      isActive: true,
      settings: {
        shopName: formData.shopName,
        logoUrl: formData.logoUrl,
        shopAddress: '',
        shopPhone: '',
        courierApiKey: '',
        courierApiUrl: 'https://www.fdedomestic.com/api/parcel/new_api_v1.php',
        courierClientId: '',
        courierMode: CourierMode.STANDARD,
        showBillQr: true
      }
    };
    const adminUser = {
      username: formData.adminEmail,
      password: formData.adminPass
    };
    await this.request('/tenants', 'POST', { tenant, adminUser });
  }

  async deleteTenant(tenantId: string): Promise<void> {
    await this.request('/tenants', 'DELETE', null, { id: tenantId });
  }

  async getGlobalCities(): Promise<string[]> {
    const data = await this.request('/cities', 'GET');
    return data.cities || [];
  }

  async updateGlobalCities(cities: string[]): Promise<void> {
    await this.request('/cities', 'POST', { cities });
  }

  async getTeamMembers(tenantId: string): Promise<User[]> {
    return this.request('/users', 'GET', null, { tenantId });
  }

  async addTeamMember(tenantId: string, username: string, role: UserRole, email: string, password?: string, permissions?: string[]): Promise<void> {
    const user: any = { id: `u-${Date.now()}`, username, email, role, tenantId, permissions, password };
    await this.request('/users', 'POST', user);
  }

  async removeTeamMember(id: string): Promise<void> {
    await this.request('/users', 'DELETE', null, { id });
  }

  async shipOrder(order: Order, tenantId: string): Promise<Order> {
    return this.request('/ship-order', 'POST', { order, tenantId });
  }

  async getCustomerHistory(phone: string, tenantId: string): Promise<any> {
    if (!phone) return { status: CustomerStatus.NEW, count: 0, returns: 0 };
    return this.request('/customer-history', 'GET', null, { phone, tenantId });
  }

  async getCustomerDetailedHistory(phone: string, tenantId: string): Promise<Order[]> {
    if (!phone) return [];
    const res = await this.request('/customer-history-detailed', 'GET', null, { phone, tenantId });
    return Array.isArray(res) ? res : [];
  }

  async processReturn(trackingOrId: string, tenantId: string): Promise<Order | null> {
    return this.request('/process-return', 'POST', { trackingOrId, tenantId });
  }

  async getSecurityLogs(): Promise<any[]> {
    return this.request('/security-logs', 'GET');
  }
}
export const db = new BackendService();
