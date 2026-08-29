import { supabase } from './client';
import { Product, Invoice, StockLog, Attendance, StoreSettings, ReturnRecord, User, Category, Customer, Expense, UdhaarLog } from './types';
import { preloadAndCacheProductImages } from './local-image-cache';

const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'Zentura POS Store',
  store_admin_name: 'Store Admin',
  store_address: 'Commercial Plaza, Main Branch',
  store_phone: '+92 (051) 111-936-887',
  receipt_header_note: 'Welcome to our store',
  receipt_footer_note: 'Thank you for shopping with us!',
  tax_rate_percent: 17,
  currency_symbol: 'Rs.',
  enable_udhaar: false,
  bank_name: '',
  account_number: '',
  account_title: '',
  easypaisa_number: '',
  easypaisa_title: '',
  qr_code_url: '',
  store_logo_url: ''
};

const isUuidString = (str?: string): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

export interface OfflineMutation {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

class DbSyncEngine {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<() => void> = new Set();
  private tenantId: string = 't-1';
  private isProcessingQueue: boolean = false;
  private heartbeatInterval: any = null;
  private inFlightOperations: Map<string, number> = new Map();

  private isOperationLocked(key: string, cooldownMs: number = 3000): boolean {
    const now = Date.now();
    const lastTime = this.inFlightOperations.get(key);
    if (lastTime && now - lastTime < cooldownMs) {
      return true;
    }
    this.inFlightOperations.set(key, now);
    setTimeout(() => {
      if (this.inFlightOperations.get(key) === now) {
        this.inFlightOperations.delete(key);
      }
    }, cooldownMs + 1000);
    return false;
  }

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedTenant = localStorage.getItem('zentura_active_tenant_id');
      if (savedTenant) {
        this.tenantId = savedTenant;
      }
    }
    this.initSyncChannel();
    this.startHeartbeat();
    this.syncAllFromSupabase();
  }

  public setTenantId(tenantId: string) {
    if (tenantId && this.tenantId !== tenantId) {
      this.tenantId = tenantId;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zentura_active_tenant_id', tenantId);
      }
      this.syncAllFromSupabase();
      this.broadcastChange();
    }
  }

  public getTenantId(): string {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('zentura_active_tenant_id');
      if (saved) {
        this.tenantId = saved;
      }
    }
    return this.tenantId || 't-1';
  }

  private getStorageKey(tableName: string): string {
    return `zentura_sync_${this.getTenantId()}_${tableName}`;
  }

  private getOfflineQueueKey(): string {
    return `zentura_offline_queue_${this.getTenantId()}`;
  }

  private initSyncChannel() {
    try {
      this.channel = new BroadcastChannel('zentura-db-live-sync');
      this.channel.onmessage = () => {
        this.notifyListeners();
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported in environment');
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('zentura_sync_')) {
          this.notifyListeners();
        }
      });

      window.addEventListener('online', async () => {
        console.log('⚡ Network connection restored. Flushing offline queue to Supabase...');
        await this.syncNow();
      });
    }

    // Subscribe to Supabase Realtime changes
    try {
      supabase
        .channel('public-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          this.syncAllFromSupabase();
        })
        .subscribe();
    } catch (e) {
      console.warn('Supabase Realtime subscription error:', e);
    }
  }

  private startHeartbeat() {
    if (typeof window === 'undefined') return;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(async () => {
      if (navigator.onLine && this.getOfflineQueueLength() > 0) {
        await this.processOfflineQueue();
      }
    }, 15000);
  }

  public getOfflineQueueLength(): number {
    if (typeof localStorage === 'undefined') return 0;
    try {
      const raw = localStorage.getItem(this.getOfflineQueueKey());
      if (!raw) return 0;
      const q = JSON.parse(raw);
      return Array.isArray(q) ? q.length : 0;
    } catch {
      return 0;
    }
  }

  public enqueueOfflineMutation(type: string, payload: any) {
    if (typeof localStorage === 'undefined') return;
    try {
      const key = this.getOfflineQueueKey();
      const raw = localStorage.getItem(key);
      const queue: OfflineMutation[] = raw ? JSON.parse(raw) : [];

      const mutation: OfflineMutation = {
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        payload,
        timestamp: Date.now()
      };

      queue.push(mutation);
      localStorage.setItem(key, JSON.stringify(queue));
      console.log(`📥 Enqueued offline mutation [${type}]. Total in queue: ${queue.length}`);
    } catch (e) {
      console.warn('Error enqueuing offline mutation:', e);
    }
  }

  public async processOfflineQueue(): Promise<{ success: boolean; remainingCount: number }> {
    if (typeof localStorage === 'undefined' || this.isProcessingQueue) {
      return { success: true, remainingCount: this.getOfflineQueueLength() };
    }

    const key = this.getOfflineQueueKey();
    const raw = localStorage.getItem(key);
    if (!raw) return { success: true, remainingCount: 0 };

    this.isProcessingQueue = true;

    try {
      const queue: OfflineMutation[] = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) {
        this.isProcessingQueue = false;
        return { success: true, remainingCount: 0 };
      }

      console.log(`🚀 Processing ${queue.length} offline mutations to Supabase...`);
      const remaining: OfflineMutation[] = [];

      for (const item of queue) {
        try {
          let hasError = false;
          let isDuplicate = false;

          switch (item.type) {
            case 'upsert_product': {
              const { error } = await supabase.from('products').upsert(item.payload);
              if (error) hasError = true;
              break;
            }
            case 'delete_product': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('products').delete().eq('id', item.payload.id);
                if (error) hasError = true;
              } else if (item.payload.barcode) {
                const { error } = await supabase.from('products').delete().eq('barcode', item.payload.barcode);
                if (error) hasError = true;
              }
              break;
            }
            case 'insert_invoice': {
              const { error } = await supabase.from('invoices').insert([item.payload]);
              if (error) {
                if (error.code === '23505') isDuplicate = true;
                else hasError = true;
              }
              break;
            }
            case 'insert_return': {
              const payloadData = item.payload.returnPayload || item.payload;
              const { error } = await supabase.from('returns').insert([payloadData]);
              if (error) {
                if (error.code === '23505') isDuplicate = true;
                else hasError = true;
              }
              if (item.payload.invoice_number) {
                await supabase.from('invoices').update({ status: 'refunded' }).eq('invoice_number', item.payload.invoice_number);
              }
              break;
            }
            case 'insert_stock_log': {
              const { error } = await supabase.from('stock_logs').insert([item.payload]);
              if (error) hasError = true;
              break;
            }
            case 'upsert_category': {
              const { error } = await supabase.from('categories').upsert(item.payload);
              if (error) hasError = true;
              break;
            }
            case 'delete_category': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('categories').delete().eq('id', item.payload.id);
                if (error) hasError = true;
              }
              break;
            }
            case 'upsert_user': {
              const { error } = await supabase.from('users').upsert(item.payload, { onConflict: 'email' });
              if (error) hasError = true;
              break;
            }
            case 'delete_user': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('users').delete().eq('id', item.payload.id);
                if (error) hasError = true;
              }
              if (item.payload.email) {
                const { error } = await supabase.from('users').delete().eq('email', item.payload.email);
                if (error) hasError = true;
              }
              break;
            }
            case 'upsert_customer': {
              const { error } = await supabase.from('customers').upsert(item.payload);
              if (error) hasError = true;
              break;
            }
            case 'delete_customer': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('customers').delete().eq('id', item.payload.id);
                if (error) hasError = true;
              }
              break;
            }
            case 'clock_in_attendance': {
              const { error } = await supabase.from('attendance').insert([item.payload]);
              if (error) hasError = true;
              break;
            }
            case 'clock_out_attendance': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('attendance').update({ clock_out: item.payload.clock_out }).eq('id', item.payload.id);
                if (error) hasError = true;
              } else if (item.payload.user_id) {
                const { error } = await supabase.from('attendance').update({ clock_out: item.payload.clock_out }).eq('user_id', item.payload.user_id);
                if (error) hasError = true;
              }
              break;
            }
            case 'upsert_settings': {
              const { error } = await supabase.from('settings').upsert(item.payload);
              if (error) hasError = true;
              break;
            }
            case 'upsert_expense': {
              const { error } = await supabase.from('expenses').upsert(item.payload);
              if (error) hasError = true;
              break;
            }
            case 'delete_expense': {
              if (isUuidString(item.payload.id)) {
                const { error } = await supabase.from('expenses').delete().eq('id', item.payload.id);
                if (error) hasError = true;
              }
              break;
            }
            case 'insert_udhaar_log': {
              const { error } = await supabase.from('udhaar_logs').insert([item.payload]);
              if (error) {
                if (error.code === '23505') isDuplicate = true;
                else hasError = true;
              }
              break;
            }
            default:
              console.warn('Unknown offline mutation type:', item.type);
          }

          if (hasError && !isDuplicate) {
            item.retry_count = (item.retry_count || 0) + 1;
            if (item.retry_count <= 2) {
              remaining.push(item);
            } else {
              console.warn('Dropping stuck offline mutation after max retries:', item);
            }
          }
        } catch (e) {
          console.warn('Error processing item:', item, e);
        }
      }

      if (remaining.length > 0) {
        localStorage.setItem(key, JSON.stringify(remaining));
        console.log(`⚠️ Processed offline queue with ${remaining.length} pending items.`);
      } else {
        localStorage.removeItem(key);
        console.log('✅ Offline queue fully synced with Supabase!');
      }

      this.isProcessingQueue = false;
      this.broadcastChange();
      return { success: remaining.length === 0, remainingCount: remaining.length };
    } catch (e) {
      console.warn('Error in processOfflineQueue:', e);
      this.isProcessingQueue = false;
      return { success: false, remainingCount: this.getOfflineQueueLength() };
    }
  }

  public async syncNow(): Promise<{ success: boolean; queueCount: number }> {
    try {
      const res = await this.processOfflineQueue();
      await this.syncAllFromSupabase();
      this.broadcastChange();
      return { success: res.success, queueCount: res.remainingCount };
    } catch (e) {
      console.warn('syncNow error:', e);
      return { success: false, queueCount: this.getOfflineQueueLength() };
    }
  }

  public clearOfflineQueue(): void {
    const key = this.getOfflineQueueKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      localStorage.removeItem(this.getStorageKey('offline_queue'));
    }
    this.broadcastChange();
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb());
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public broadcastChange() {
    if (this.channel) {
      this.channel.postMessage({ timestamp: Date.now(), tenantId: this.getTenantId() });
    }
    this.notifyListeners();
  }

  // --- FULL SYNC WITH SUPABASE TABLES FOR CURRENT TENANT ---
  public async syncAllFromSupabase() {
    try {
      await Promise.all([
        this.fetchStoreSettings(),
        this.fetchProducts(),
        this.fetchCategories(),
        this.fetchUsers(),
        this.fetchCustomers(),
        this.fetchInvoices(),
        this.fetchStockLogs(),
        this.fetchReturns(),
        this.fetchAttendance(),
        this.fetchExpenses(),
        this.fetchUdhaarLogs(),
      ]);
      this.notifyListeners();
    } catch (e) {
      console.warn('Error syncing with Supabase:', e);
    }
  }

  // --- PRODUCTS ---
  public async fetchProducts(): Promise<Product[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (!error && data) {
        const map = new Map<string, Product>();
        data.forEach((p) => {
          const rec: Product = {
            id: p.id,
            tenant_id: p.tenant_id || tenantId,
            sku: p.sku || `SKU-${p.id.slice(0, 4)}`,
            barcode: p.barcode || p.sku || '',
            name: p.name,
            category_id: p.category_id,
            cost_price: Number(p.cost_price || 0),
            retail_price: Number(p.retail_price || 0),
            stock_qty: Number(p.stock_qty || 0),
            min_threshold: Number(p.min_threshold || 5),
            image_url: p.image_url,
            created_at: p.created_at || new Date().toISOString()
          };
          const key = (rec.barcode && rec.barcode.trim()) ? rec.barcode.trim() : (rec.id || rec.sku);
          if (!map.has(key)) {
            map.set(key, rec);
          }
        });
        const formatted = Array.from(map.values());

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('products'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        preloadAndCacheProductImages(formatted).catch(() => {});
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchProducts warning:', e);
    }
    return this.getProducts();
  }

  public getProducts(): Product[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('products')) : null;
      if (stored) {
        const list: Product[] = JSON.parse(stored);
        const map = new Map<string, Product>();
        list.forEach((p) => {
          const key = (p.barcode && p.barcode.trim()) ? p.barcode.trim() : (p.id || p.sku);
          if (!map.has(key)) {
            map.set(key, p);
          }
        });
        const result = Array.from(map.values());
        preloadAndCacheProductImages(result).catch(() => {});
        return result;
      }
    } catch (e) {
      console.warn('Error reading products cache:', e);
    }
    return [];
  }

  public saveProduct(product: Partial<Product>): Product {
    const tenantId = this.getTenantId();
    const products = this.getProducts();
    let updatedProduct: Product;
    const now = new Date().toISOString();

    const existingIdx = products.findIndex((p) =>
      (product.id && p.id === product.id) ||
      (product.barcode && p.barcode && p.barcode.trim() === product.barcode.trim()) ||
      (product.sku && p.sku && p.sku.trim() === product.sku.trim()) ||
      (product.name && p.name.trim().toLowerCase() === product.name.trim().toLowerCase())
    );

    if (existingIdx !== -1) {
      products[existingIdx] = { ...products[existingIdx], ...product, tenant_id: tenantId } as Product;
      updatedProduct = products[existingIdx];
    } else {
      updatedProduct = {
        id: product.id || `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tenant_id: tenantId,
        sku: product.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        barcode: product.barcode || '',
        name: product.name || 'Unnamed Product',
        category_id: product.category_id,
        cost_price: Number(product.cost_price || 0),
        retail_price: Number(product.retail_price || 0),
        stock_qty: Number(product.stock_qty || 0),
        min_threshold: Number(product.min_threshold || 5),
        image_url: product.image_url,
        created_at: product.created_at || now
      };
      products.push(updatedProduct);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('products'), JSON.stringify(products));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      sku: updatedProduct.sku,
      barcode: updatedProduct.barcode,
      name: updatedProduct.name,
      category_id: isUuidString(updatedProduct.category_id) ? updatedProduct.category_id : null,
      cost_price: updatedProduct.cost_price,
      retail_price: updatedProduct.retail_price,
      stock_qty: updatedProduct.stock_qty,
      min_threshold: updatedProduct.min_threshold,
      image_url: updatedProduct.image_url
    };

    if (isUuidString(updatedProduct.id)) {
      payload.id = updatedProduct.id;
    }

    // Try cloud sync; on failure or offline, enqueue into offline mutation queue
    supabase
      .from('products')
      .upsert(payload)
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Supabase product save warning, enqueuing offline mutation:', error);
          this.enqueueOfflineMutation('upsert_product', payload);
        } else if (data) {
          updatedProduct.id = data.id;
          if (typeof localStorage !== 'undefined') {
            const currentProds = this.getProducts();
            const idx = currentProds.findIndex((p) => p.barcode === updatedProduct.barcode || p.id === updatedProduct.id);
            if (idx !== -1) {
              currentProds[idx].id = data.id;
              localStorage.setItem(this.getStorageKey('products'), JSON.stringify(currentProds));
            }
          }
          this.broadcastChange();
        }
      })
      .catch((err) => {
        console.warn('Network error saving product, enqueuing offline mutation:', err);
        this.enqueueOfflineMutation('upsert_product', payload);
      });

    return updatedProduct;
  }

  public deleteProduct(id: string): void {
    const prods = this.getProducts();
    const target = prods.find((p) => p.id === id || p.barcode === id || p.sku === id);
    const products = prods.filter((p) => p.id !== id && p.barcode !== id && p.sku !== id);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('products'), JSON.stringify(products));
    }
    this.broadcastChange();

    const deletePayload = { id, barcode: target?.barcode || (isUuidString(id) ? null : id) };

    if (isUuidString(id)) {
      supabase.from('products').delete().eq('id', id).then(({ error }) => {
        if (error) {
          this.enqueueOfflineMutation('delete_product', deletePayload);
        }
      }).catch(() => {
        this.enqueueOfflineMutation('delete_product', deletePayload);
      });
    } else {
      supabase.from('products').delete().eq('barcode', id).then(({ error }) => {
        if (error) {
          this.enqueueOfflineMutation('delete_product', deletePayload);
        }
      }).catch(() => {
        this.enqueueOfflineMutation('delete_product', deletePayload);
      });
    }
  }

  // --- CATEGORIES ---
  public async fetchCategories(): Promise<Category[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (!error && data) {
        const formatted: Category[] = data.map((c) => ({
          id: c.id,
          tenant_id: c.tenant_id || tenantId,
          name: c.name,
          tax_rate: Number(c.tax_rate || 0),
          badge_color: c.badge_color || '#4F46E5',
          created_at: c.created_at || new Date().toISOString()
        }));

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchCategories warning:', e);
    }
    return this.getCategories();
  }

  public getCategories(): Category[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('categories')) : null;
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading categories cache:', e);
    }
    return [];
  }

  public saveCategory(category: Partial<Category>): Category {
    const tenantId = this.getTenantId();
    const categories = this.getCategories();
    let updatedCat: Category;

    if (category.id) {
      const idx = categories.findIndex((c) => c.id === category.id);
      if (idx !== -1) {
        categories[idx] = { ...categories[idx], ...category, tenant_id: tenantId } as Category;
        updatedCat = categories[idx];
      } else {
        updatedCat = {
          id: category.id,
          tenant_id: tenantId,
          name: category.name || 'Category',
          tax_rate: Number(category.tax_rate || 0),
          badge_color: category.badge_color || '#4F46E5',
          created_at: new Date().toISOString()
        };
        categories.push(updatedCat);
      }
    } else {
      updatedCat = {
        id: `cat-${Date.now()}`,
        tenant_id: tenantId,
        name: category.name || 'Category',
        tax_rate: Number(category.tax_rate || 0),
        badge_color: category.badge_color || '#4F46E5',
        created_at: new Date().toISOString()
      };
      categories.push(updatedCat);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(categories));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      name: updatedCat.name,
      tax_rate: updatedCat.tax_rate,
      badge_color: updatedCat.badge_color
    };
    if (isUuidString(updatedCat.id)) {
      payload.id = updatedCat.id;
    }

    supabase.from('categories').upsert(payload).then(({ error }) => {
      if (error) {
        this.enqueueOfflineMutation('upsert_category', payload);
      }
    }).catch(() => {
      this.enqueueOfflineMutation('upsert_category', payload);
    });

    return updatedCat;
  }

  public deleteCategory(id: string): void {
    const categories = this.getCategories().filter((c) => c.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(categories));
    }
    this.broadcastChange();
    if (isUuidString(id)) {
      supabase.from('categories').delete().eq('id', id).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_category', { id });
      }).catch(() => this.enqueueOfflineMutation('delete_category', { id }));
    }
  }

  // --- USERS & STAFF ---
  public async fetchUsers(): Promise<User[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (!error && data) {
        const formatted: User[] = data.map((u) => ({
          id: u.id,
          tenant_id: u.tenant_id || tenantId,
          name: u.name,
          email: u.email,
          phone: u.phone || u.phone_number || '',
          role: u.role || 'cashier',
          pin_code: u.pin_code || '1041',
          rfid_tag: u.rfid_tag,
          created_at: u.created_at || new Date().toISOString()
        }));

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('users'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchUsers warning:', e);
    }
    return this.getUsers();
  }

  public getUsers(): User[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('users')) : null;
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading users cache:', e);
    }
    return [];
  }

  public saveUser(user: Partial<User>): User {
    const tenantId = this.getTenantId();
    const users = this.getUsers();
    let updatedUser: User;
    const now = new Date().toISOString();

    const cleanEmail = (user.email || `user-${Date.now()}@zentura.io`).trim().toLowerCase();
    const cleanPhone = (user.phone || '').trim();
    const cleanName = (user.name || 'Staff User').trim();
    const cleanPin = (user.pin_code || '1041').trim();
    const cleanRfid = (user.rfid_tag || '').trim();

    if (user.id) {
      const idx = users.findIndex((u) => u.id === user.id || u.email.trim().toLowerCase() === cleanEmail);
      if (idx !== -1) {
        users[idx] = {
          ...users[idx],
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role: user.role || users[idx].role,
          pin_code: cleanPin,
          rfid_tag: cleanRfid,
          tenant_id: tenantId
        };
        updatedUser = users[idx];
      } else {
        updatedUser = {
          id: user.id,
          tenant_id: tenantId,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role: user.role || 'cashier',
          pin_code: cleanPin,
          rfid_tag: cleanRfid,
          created_at: now
        };
        users.push(updatedUser);
      }
    } else {
      updatedUser = {
        id: `u-${Date.now()}`,
        tenant_id: tenantId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: user.role || 'cashier',
        pin_code: cleanPin,
        rfid_tag: cleanRfid,
        created_at: now
      };
      users.push(updatedUser);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('users'), JSON.stringify(users));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      pin_code: updatedUser.pin_code,
      rfid_tag: updatedUser.rfid_tag
    };

    if (isUuidString(updatedUser.id)) {
      payload.id = updatedUser.id;
    }

    supabase
      .from('users')
      .upsert(payload, { onConflict: 'email' })
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Supabase user save error, enqueuing offline mutation:', error);
          this.enqueueOfflineMutation('upsert_user', payload);
        } else if (data) {
          updatedUser.id = data.id;
          const currentUsers = this.getUsers();
          const idx = currentUsers.findIndex((u) => u.email.trim().toLowerCase() === updatedUser.email.trim().toLowerCase());
          if (idx !== -1) {
            currentUsers[idx].id = data.id;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(this.getStorageKey('users'), JSON.stringify(currentUsers));
            }
          }
          this.broadcastChange();
        }
      })
      .catch((err) => {
        console.warn('Network error saving user, enqueuing offline mutation:', err);
        this.enqueueOfflineMutation('upsert_user', payload);
      });

    return updatedUser;
  }

  public deleteUser(idOrUser: string | User): void {
    const targetId = typeof idOrUser === 'string' ? idOrUser : idOrUser.id;
    const targetEmail = typeof idOrUser === 'object' ? idOrUser.email : idOrUser;

    const users = this.getUsers().filter((u) => u.id !== targetId && u.email.trim().toLowerCase() !== (targetEmail ? targetEmail.trim().toLowerCase() : ''));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('users'), JSON.stringify(users));
    }
    this.broadcastChange();

    const deletePayload = { id: targetId, email: targetEmail };

    if (isUuidString(targetId)) {
      supabase.from('users').delete().eq('id', targetId).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_user', deletePayload);
      }).catch(() => this.enqueueOfflineMutation('delete_user', deletePayload));
    }
    if (targetEmail) {
      supabase.from('users').delete().eq('email', targetEmail.trim().toLowerCase()).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_user', deletePayload);
      }).catch(() => this.enqueueOfflineMutation('delete_user', deletePayload));
    }
  }

  public authenticateCashierByPin(pin: string): User | null {
    const cleanPin = pin.trim();
    const users = this.getUsers();
    const found = users.find((u) => u.pin_code && u.pin_code.trim() === cleanPin);
    return found || null;
  }

  // --- CUSTOMERS ---
  public deduplicateCustomers(list: Customer[]): Customer[] {
    if (!Array.isArray(list) || list.length === 0) return [];

    const map = new Map<string, Customer>();

    for (const c of list) {
      if (!c) continue;
      const cleanName = (c.name || 'Customer').trim().toLowerCase();
      const cleanPhone = (c.phone || '').trim().replace(/\D/g, '');
      const cleanEmail = (c.email || '').trim().toLowerCase();

      // Determine unique identification key:
      // Priority 1: Phone number (when >= 7 digits)
      // Priority 2: Email (when valid)
      // Priority 3: Exact name (when not generic fallback)
      // Priority 4: Unique ID
      let primaryKey = '';
      if (cleanPhone.length >= 7) {
        primaryKey = `phone_${cleanPhone}`;
      } else if (cleanEmail && cleanEmail !== 'n/a' && cleanEmail.includes('@')) {
        primaryKey = `email_${cleanEmail}`;
      } else if (cleanName && cleanName !== 'customer' && cleanName !== 'walk-in customer' && cleanName !== 'new customer') {
        primaryKey = `name_${cleanName}`;
      } else {
        primaryKey = `id_${c.id}`;
      }

      if (!map.has(primaryKey)) {
        map.set(primaryKey, { ...c });
      } else {
        // Merge duplicate customer record cleanly without inflating debt
        const existing = map.get(primaryKey)!;
        const preferExistingUuid = isUuidString(existing.id);
        const preferNewUuid = isUuidString(c.id);

        map.set(primaryKey, {
          id: preferNewUuid ? c.id : (preferExistingUuid ? existing.id : (existing.id || c.id)),
          tenant_id: existing.tenant_id || c.tenant_id,
          name: existing.name || c.name,
          email: (existing.email && existing.email !== 'N/A') ? existing.email : (c.email || ''),
          phone: existing.phone || c.phone || '',
          loyalty_points: Math.max(Number(existing.loyalty_points || 0), Number(c.loyalty_points || 0)),
          credit_balance: Math.max(Number(existing.credit_balance || 0), Number(c.credit_balance || 0)),
          created_at: existing.created_at || c.created_at || new Date().toISOString()
        });
      }
    }

    return Array.from(map.values());
  }

  public async fetchCustomers(): Promise<Customer[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (!error && data) {
        const rawList: Customer[] = data.map((c) => ({
          id: c.id,
          tenant_id: c.tenant_id || tenantId,
          name: c.name,
          email: c.email || '',
          phone: c.phone || '',
          loyalty_points: Number(c.loyalty_points || 0),
          credit_balance: Number(c.credit_balance || 0),
          created_at: c.created_at || new Date().toISOString()
        }));

        const formatted = this.deduplicateCustomers(rawList);

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchCustomers warning:', e);
    }
    return this.getCustomers();
  }

  public getCustomers(): Customer[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('customers')) : null;
      if (stored) {
        const list: Customer[] = JSON.parse(stored);
        return this.deduplicateCustomers(list);
      }
    } catch (e) {
      console.warn('Error reading customers cache:', e);
    }
    return [];
  }

  public saveCustomer(cust: Partial<Customer>): Customer {
    const tenantId = this.getTenantId();
    const customers = this.getCustomers();
    let updated: Customer;
    const now = new Date().toISOString();

    const cleanName = (cust.name || 'Customer').trim();
    const cleanPhone = (cust.phone || '').trim();
    const cleanEmail = (cust.email || '').trim().toLowerCase();
    const normalizedPhone = cleanPhone.replace(/\D/g, '');

    const lockKey = `customer_save_${cleanName.toLowerCase()}_${normalizedPhone}`;
    if (!cust.id && this.isOperationLocked(lockKey, 3000)) {
      console.warn('Duplicate customer save ignored within 3 seconds:', lockKey);
      const existing = customers.find(c =>
        (normalizedPhone.length >= 7 && c.phone && c.phone.replace(/\D/g, '') === normalizedPhone) ||
        (cleanName && c.name.trim().toLowerCase() === cleanName.toLowerCase())
      );
      if (existing) return existing;
    }

    // Match existing customer by ID, Phone (digits only), or Name
    let existingIdx = -1;
    if (cust.id) {
      existingIdx = customers.findIndex((c) => c.id === cust.id);
    }
    if (existingIdx === -1 && normalizedPhone.length >= 7) {
      existingIdx = customers.findIndex(
        (c) => c.phone && c.phone.replace(/\D/g, '') === normalizedPhone
      );
    }
    if (existingIdx === -1 && cleanName && cleanName.toLowerCase() !== 'customer' && cleanName.toLowerCase() !== 'walk-in customer' && cleanName.toLowerCase() !== 'new customer') {
      existingIdx = customers.findIndex(
        (c) => c.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
    }

    if (existingIdx !== -1) {
      const existing = customers[existingIdx];
      customers[existingIdx] = {
        ...existing,
        ...cust,
        id: isUuidString(existing.id) ? existing.id : (cust.id || existing.id),
        name: cleanName || existing.name,
        phone: cleanPhone || existing.phone,
        email: cleanEmail || existing.email,
        credit_balance: cust.credit_balance !== undefined ? Number(cust.credit_balance) : Number(existing.credit_balance || 0),
        loyalty_points: cust.loyalty_points !== undefined ? Number(cust.loyalty_points) : Number(existing.loyalty_points || 0),
        tenant_id: tenantId
      } as Customer;
      updated = customers[existingIdx];
    } else {
      updated = {
        id: cust.id || `cust-${Date.now()}`,
        tenant_id: tenantId,
        name: cleanName || 'Customer',
        email: cleanEmail,
        phone: cleanPhone,
        loyalty_points: Number(cust.loyalty_points || 0),
        credit_balance: Number(cust.credit_balance || 0),
        created_at: now
      };
      customers.push(updated);
    }

    const deduplicated = this.deduplicateCustomers(customers);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(deduplicated));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      loyalty_points: updated.loyalty_points,
      credit_balance: updated.credit_balance
    };
    if (isUuidString(updated.id)) {
      payload.id = updated.id;
    }

    supabase
      .from('customers')
      .upsert(payload)
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) {
          this.enqueueOfflineMutation('upsert_customer', payload);
        } else if (data) {
          updated.id = data.id;
          const currentList = this.getCustomers();
          const matchIdx = currentList.findIndex(c =>
            (normalizedPhone.length >= 7 && c.phone && c.phone.replace(/\D/g, '') === normalizedPhone) ||
            c.name.toLowerCase() === updated.name.toLowerCase() ||
            c.id === updated.id
          );
          if (matchIdx !== -1) {
            currentList[matchIdx].id = data.id;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(this.deduplicateCustomers(currentList)));
            }
            this.broadcastChange();
          }
        }
      })
      .catch(() => this.enqueueOfflineMutation('upsert_customer', payload));

    return updated;
  }

  public deleteCustomer(id: string): void {
    const custs = this.getCustomers();
    const target = custs.find(c => c.id === id);
    const customers = custs.filter((c) => c.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(customers));
    }
    this.broadcastChange();
    if (isUuidString(id)) {
      supabase.from('customers').delete().eq('id', id).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_customer', { id });
      }).catch(() => this.enqueueOfflineMutation('delete_customer', { id }));
    } else if (target && target.phone) {
      supabase.from('customers').delete().eq('phone', target.phone).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_customer', { id, phone: target.phone });
      }).catch(() => this.enqueueOfflineMutation('delete_customer', { id, phone: target.phone }));
    }
  }

  // --- INVOICES & CHECKOUT ---
  public async fetchInvoices(): Promise<Invoice[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const uniqueMap = new Map<string, Invoice>();
        data.forEach((i) => {
          const rec: Invoice = {
            id: i.id,
            tenant_id: i.tenant_id || tenantId,
            cashier_id: i.cashier_id || 'Cashier #01',
            invoice_number: i.invoice_number,
            subtotal: Number(i.subtotal || 0),
            tax: Number(i.tax || 0),
            total: Number(i.total || 0),
            tendered: Number(i.tendered || 0),
            change: Number(i.change || 0),
            payment_method: i.payment_method || 'cash',
            status: i.status || 'completed',
            cost_price_total: Number(i.cost_price_total || 0),
            created_at: i.created_at || new Date().toISOString()
          };
          if (!uniqueMap.has(rec.invoice_number)) {
            uniqueMap.set(rec.invoice_number, rec);
          }
        });
        const formatted = Array.from(uniqueMap.values());

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('invoices'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchInvoices warning:', e);
    }
    return this.getInvoices();
  }

  public getInvoices(): Invoice[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('invoices')) : null;
      if (stored) {
        const list: Invoice[] = JSON.parse(stored);
        const uniqueMap = new Map<string, Invoice>();
        list.forEach((i) => {
          if (!uniqueMap.has(i.invoice_number)) {
            uniqueMap.set(i.invoice_number, i);
          }
        });
        return Array.from(uniqueMap.values());
      }
    } catch (e) {
      console.warn('Error reading invoices cache:', e);
    }
    return [];
  }

  public createInvoice(
    invoiceData: Omit<Invoice, 'id' | 'created_at'>,
    items: { product_id: string; qty: number; unit_price: number; name: string }[]
  ): Invoice {
    const tenantId = this.getTenantId();
    const lockKey = `invoice_${invoiceData.invoice_number}`;
    const invoices = this.getInvoices();

    const existing = invoices.find(i => i.invoice_number === invoiceData.invoice_number);
    if (existing) {
      console.warn(`Invoice ${invoiceData.invoice_number} already exists, returning existing.`);
      return existing;
    }
    if (this.isOperationLocked(lockKey, 4000)) {
      console.warn(`Invoice ${invoiceData.invoice_number} locked in-flight.`);
      if (invoices[0]) return invoices[0];
    }

    // Deduct stock for sold items & compute total cost price
    const products = this.getProducts();
    let totalCostPrice = 0;

    items.forEach((item) => {
      const prod = products.find((p) => p.id === item.product_id || p.barcode === item.product_id || p.sku === item.product_id);
      if (prod) {
        prod.stock_qty = Math.max(0, prod.stock_qty - item.qty);
        totalCostPrice += (prod.cost_price || 0) * item.qty;
      }
    });

    const newInvoice: Invoice = {
      ...invoiceData,
      tenant_id: tenantId,
      id: `inv-${Date.now()}`,
      items,
      cost_price_total: totalCostPrice,
      created_at: new Date().toISOString()
    };

    invoices.unshift(newInvoice);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('invoices'), JSON.stringify(invoices));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('products'), JSON.stringify(products));
    }

    this.broadcastChange();

    try {
      const payload: any = {
        tenant_id: tenantId,
        cashier_id: newInvoice.cashier_id,
        invoice_number: newInvoice.invoice_number,
        subtotal: newInvoice.subtotal,
        tax: newInvoice.tax,
        total: newInvoice.total,
        tendered: newInvoice.tendered,
        change: newInvoice.change,
        payment_method: newInvoice.payment_method,
        status: newInvoice.status,
        cost_price_total: totalCostPrice
      };
      if (isUuidString(newInvoice.id)) {
        payload.id = newInvoice.id;
      }

      supabase.from('invoices').insert([payload]).then(({ error }) => {
        if (error) {
          console.warn('Supabase invoice insert warning, enqueuing offline mutation:', error);
          this.enqueueOfflineMutation('insert_invoice', payload);
        }
      }).catch((err) => {
        console.warn('Network error creating invoice, enqueuing offline mutation:', err);
        this.enqueueOfflineMutation('insert_invoice', payload);
      });

      if (items && items.length > 0) {
        const itemPayloads = items.map((item) => {
          const prod = products.find((p) => p.id === item.product_id || p.barcode === item.product_id || p.sku === item.product_id);
          return {
            tenant_id: tenantId,
            invoice_number: newInvoice.invoice_number,
            product_id: isUuidString(item.product_id) ? item.product_id : null,
            product_name: item.name,
            qty: item.qty,
            unit_price: item.unit_price,
            cost_price: prod ? prod.cost_price : 0,
            total_price: item.unit_price * item.qty
          };
        });
        supabase.from('invoice_items').insert(itemPayloads).then(({ error }) => {
          if (error) console.warn('Supabase invoice_items insert warning:', error);
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Error in Supabase invoice background sync:', e);
    }

    return newInvoice;
  }

  // --- RETURNS & REFUNDS ---
  public async fetchReturns(): Promise<ReturnRecord[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('returns')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const uniqueMap = new Map<string, ReturnRecord>();
        data.forEach((r) => {
          const rec: ReturnRecord = {
            id: r.id,
            tenant_id: r.tenant_id || tenantId,
            invoice_number: r.invoice_number,
            customer_detail: r.customer_detail || 'Walk-in Customer',
            refund_amount: Number(r.refund_amount || 0),
            reason: r.reason || 'Customer Return',
            processed_by: r.processed_by || 'Manager',
            created_at: r.created_at || new Date().toISOString()
          };
          if (!uniqueMap.has(rec.invoice_number)) {
            uniqueMap.set(rec.invoice_number, rec);
          }
        });
        const formatted = Array.from(uniqueMap.values());

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('returns'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchReturns warning:', e);
    }
    return this.getReturns();
  }

  public getReturns(): ReturnRecord[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('returns')) : null;
      if (stored) {
        const parsed: ReturnRecord[] = JSON.parse(stored);
        const uniqueMap = new Map<string, ReturnRecord>();
        parsed.forEach((r) => {
          if (!uniqueMap.has(r.invoice_number)) {
            uniqueMap.set(r.invoice_number, r);
          }
        });
        return Array.from(uniqueMap.values());
      }
    } catch (e) {
      console.warn('Error reading returns cache:', e);
    }
    return [];
  }

  public processReturn(invoiceNumber: string, reason: string, refundAmount: number, processedBy: string): ReturnRecord {
    const tenantId = this.getTenantId();
    const lockKey = `return_${invoiceNumber}`;
    const returns = this.getReturns();

    // Check if return for this bill already exists or is locked in-flight
    const isLocked = this.isOperationLocked(lockKey, 4000);
    const existing = returns.find((r) => r.invoice_number === invoiceNumber);
    if (existing) {
      console.warn(`Return for invoice ${invoiceNumber} already exists. Returning existing record.`);
      return existing;
    }
    if (isLocked) {
      console.warn(`Return for invoice ${invoiceNumber} is currently processing.`);
    }

    const newReturn: ReturnRecord = {
      id: `ret-${Date.now()}`,
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      customer_detail: 'Walk-in Customer',
      refund_amount: refundAmount,
      reason,
      processed_by: processedBy,
      created_at: new Date().toISOString()
    };

    returns.unshift(newReturn);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('returns'), JSON.stringify(returns));
    }

    const invoices = this.getInvoices();
    const inv = invoices.find((i) => i.invoice_number === invoiceNumber || i.id === invoiceNumber);
    if (inv) {
      inv.status = 'refunded';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getStorageKey('invoices'), JSON.stringify(invoices));
      }
    }

    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      invoice_number: newReturn.invoice_number,
      customer_detail: newReturn.customer_detail,
      refund_amount: newReturn.refund_amount,
      reason: newReturn.reason,
      processed_by: newReturn.processed_by
    };
    if (isUuidString(newReturn.id)) {
      payload.id = newReturn.id;
    }

    supabase.from('returns').insert([payload]).then(({ error }) => {
      if (error) {
        this.enqueueOfflineMutation('insert_return', { returnPayload: payload, invoice_number: invoiceNumber });
      }
    }).catch(() => {
      this.enqueueOfflineMutation('insert_return', { returnPayload: payload, invoice_number: invoiceNumber });
    });

    supabase.from('invoices').update({ status: 'refunded' }).eq('invoice_number', invoiceNumber).then();

    return newReturn;
  }

  // --- STOCK LOGS ---
  private deduplicateStockLogs(list: StockLog[]): StockLog[] {
    const result: StockLog[] = [];
    const seenIds = new Set<string>();

    for (const s of list) {
      if (!s || !s.id) continue;
      if (seenIds.has(s.id)) continue;

      const timeMs = new Date(s.created_at || Date.now()).getTime();
      const isDuplicate = result.some((existing) => {
        const existingTimeMs = new Date(existing.created_at || Date.now()).getTime();
        return (
          existing.product_id === s.product_id &&
          existing.change_qty === s.change_qty &&
          existing.reason === s.reason &&
          Math.abs(existingTimeMs - timeMs) <= 5000
        );
      });

      if (!isDuplicate) {
        seenIds.add(s.id);
        result.push(s);
      }
    }
    return result;
  }

  public async fetchStockLogs(): Promise<StockLog[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('stock_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const rawLogs: StockLog[] = data.map((s) => ({
          id: s.id,
          tenant_id: s.tenant_id || tenantId,
          product_id: s.product_id,
          cashier_id: s.cashier_id || 'Cashier #01',
          change_qty: Number(s.change_qty || 0),
          reason: s.reason || 'Stock Update',
          locked: s.locked ?? true,
          created_at: s.created_at || new Date().toISOString()
        }));

        const formatted = this.deduplicateStockLogs(rawLogs);

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('stock_logs'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchStockLogs warning:', e);
    }
    return this.getStockLogs();
  }

  public getStockLogs(): StockLog[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('stock_logs')) : null;
      if (stored) {
        const list: StockLog[] = JSON.parse(stored);
        return this.deduplicateStockLogs(list);
      }
    } catch (e) {
      console.warn('Error reading stock logs cache:', e);
    }
    return [];
  }

  public createStockLog(log: Omit<StockLog, 'id' | 'created_at'>): StockLog {
    const tenantId = this.getTenantId();
    const lockKey = `stock_log_${log.product_id}_${log.change_qty}_${log.reason}`;
    const logs = this.getStockLogs();

    // Debounce duplicate log entries submitted within 4 seconds or locked in-flight
    const isLocked = this.isOperationLocked(lockKey, 4000);
    const recentDuplicate = logs.find((l) =>
      l.product_id === log.product_id &&
      l.change_qty === log.change_qty &&
      l.reason === log.reason &&
      Math.abs(Date.now() - new Date(l.created_at).getTime()) < 4000
    );

    if (isLocked || recentDuplicate) {
      console.warn('Duplicate stock log ignored within 4 seconds:', recentDuplicate || lockKey);
      if (recentDuplicate) return recentDuplicate;
    }

    const newLog: StockLog = {
      ...log,
      tenant_id: tenantId,
      id: `sl-${Date.now()}`,
      created_at: new Date().toISOString()
    };

    logs.unshift(newLog);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('stock_logs'), JSON.stringify(logs));
    }

    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      product_id: newLog.product_id,
      cashier_id: newLog.cashier_id,
      change_qty: newLog.change_qty,
      reason: newLog.reason,
      locked: newLog.locked
    };
    if (isUuidString(newLog.id)) {
      payload.id = newLog.id;
    }

    supabase.from('stock_logs').insert([payload]).then(({ error }) => {
      if (error) {
        this.enqueueOfflineMutation('insert_stock_log', payload);
      }
    }).catch(() => {
      this.enqueueOfflineMutation('insert_stock_log', payload);
    });

    return newLog;
  }

  public adjustStock(productId: string, delta: number, reason: string, cashierId: string = 'Admin'): void {
    const lockKey = `adjust_stock_${productId}_${delta}_${reason}`;
    if (this.isOperationLocked(lockKey, 3000)) {
      console.warn('adjustStock ignored due to rapid duplicate trigger:', lockKey);
      return;
    }
    const products = this.getProducts();
    const prod = products.find((p) => p.id === productId || p.barcode === productId || p.sku === productId);
    if (prod) {
      prod.stock_qty = Math.max(0, prod.stock_qty + delta);
      this.saveProduct(prod);
      this.createStockLog({
        tenant_id: this.getTenantId(),
        product_id: prod.barcode || prod.sku || prod.id,
        cashier_id: cashierId,
        change_qty: delta,
        reason,
        locked: true
      });
    }
  }

  // --- ATTENDANCE ---
  public async fetchAttendance(): Promise<Attendance[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const uniqueMap = new Map<string, Attendance>();
        data.forEach((a) => {
          const rec: Attendance = {
            id: a.id,
            tenant_id: a.tenant_id || tenantId,
            user_id: a.user_id,
            clock_in: a.clock_in,
            clock_out: a.clock_out,
            device_uuid: a.device_uuid,
            created_at: a.created_at || new Date().toISOString()
          };
          if (!uniqueMap.has(rec.id)) {
            uniqueMap.set(rec.id, rec);
          }
        });
        const formatted = Array.from(uniqueMap.values());

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('attendance'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchAttendance warning:', e);
    }
    return this.getAttendanceLogs();
  }

  public getAttendanceLogs(): Attendance[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('attendance')) : null;
      if (stored) {
        const list: Attendance[] = JSON.parse(stored);
        const uniqueMap = new Map<string, Attendance>();
        list.forEach((a) => {
          if (!uniqueMap.has(a.id)) {
            uniqueMap.set(a.id, a);
          }
        });
        return Array.from(uniqueMap.values());
      }
    } catch (e) {
      console.warn('Error reading attendance cache:', e);
    }
    return [];
  }

  public clockInUser(userId: string): Attendance {
    const tenantId = this.getTenantId();
    const lockKey = `clockin_${userId}`;
    const logs = this.getAttendanceLogs();

    if (this.isOperationLocked(lockKey, 5000)) {
      const active = logs.find(l => l.user_id === userId && !l.clock_out);
      if (active) return active;
    }

    const activeExisting = logs.find(l => l.user_id === userId && !l.clock_out);
    if (activeExisting) {
      console.warn(`User ${userId} is already clocked in.`);
      return activeExisting;
    }

    const newLog: Attendance = {
      id: `att-${Date.now()}`,
      tenant_id: tenantId,
      user_id: userId,
      clock_in: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    logs.unshift(newLog);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('attendance'), JSON.stringify(logs));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      user_id: newLog.user_id,
      clock_in: newLog.clock_in
    };
    if (isUuidString(newLog.id)) {
      payload.id = newLog.id;
    }

    supabase.from('attendance').insert([payload]).then(({ error }) => {
      if (error) this.enqueueOfflineMutation('clock_in_attendance', payload);
    }).catch(() => this.enqueueOfflineMutation('clock_in_attendance', payload));

    return newLog;
  }

  public clockOutUser(attendanceId: string): void {
    const lockKey = `clockout_${attendanceId}`;
    if (this.isOperationLocked(lockKey, 3000)) {
      return;
    }
    const logs = this.getAttendanceLogs();
    const log = logs.find((l) => l.id === attendanceId || l.user_id === attendanceId);
    if (log && !log.clock_out) {
      log.clock_out = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getStorageKey('attendance'), JSON.stringify(logs));
      }
      this.broadcastChange();

      const clockOutPayload = { id: log.id, user_id: log.user_id, clock_out: log.clock_out };

      if (isUuidString(log.id)) {
        supabase.from('attendance').update({ clock_out: log.clock_out }).eq('id', log.id).then(({ error }) => {
          if (error) this.enqueueOfflineMutation('clock_out_attendance', clockOutPayload);
        }).catch(() => this.enqueueOfflineMutation('clock_out_attendance', clockOutPayload));
      } else {
        supabase.from('attendance').update({ clock_out: log.clock_out }).eq('user_id', log.user_id).then(({ error }) => {
          if (error) this.enqueueOfflineMutation('clock_out_attendance', clockOutPayload);
        }).catch(() => this.enqueueOfflineMutation('clock_out_attendance', clockOutPayload));
      }
    }
  }

  // --- STORE SETTINGS ---
  public async fetchStoreSettings(): Promise<StoreSettings> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (!error && data) {
        const rawFooter = data.receipt_footer_note || DEFAULT_SETTINGS.receipt_footer_note;
        const cleanFooter = rawFooter.replace(/\s*Powered by Zentura POS/gi, '').trim() || 'Thank you for shopping with us!';

        const formatted: StoreSettings = {
          id: data.id || tenantId,
          tenant_id: tenantId,
          store_name: data.store_name || DEFAULT_SETTINGS.store_name,
          store_admin_name: data.store_admin_name || DEFAULT_SETTINGS.store_admin_name,
          store_address: data.store_address || DEFAULT_SETTINGS.store_address,
          store_phone: data.store_phone || DEFAULT_SETTINGS.store_phone,
          receipt_header_note: data.receipt_header_note || DEFAULT_SETTINGS.receipt_header_note,
          receipt_footer_note: cleanFooter,
          tax_rate_percent: Number(data.tax_rate_percent ?? 17),
          currency_symbol: data.currency_symbol || 'Rs.',
          enable_udhaar: Boolean(data.enable_udhaar),
          bank_name: data.bank_name || '',
          account_number: data.account_number || '',
          account_title: data.account_title || '',
          easypaisa_number: data.easypaisa_number || '',
          easypaisa_title: data.easypaisa_title || '',
          qr_code_url: data.qr_code_url || '',
          store_logo_url: data.store_logo_url || ''
        };
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(formatted));
        }
        return formatted;
      }
    } catch (e) {
      console.warn('Error fetching store settings:', e);
    }
    return this.getStoreSettings();
  }

  public getStoreSettings(): StoreSettings {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('settings')) : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.receipt_footer_note) {
          parsed.receipt_footer_note = parsed.receipt_footer_note.replace(/\s*Powered by Zentura POS/gi, '').trim() || 'Thank you for shopping with us!';
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Error reading store settings:', e);
    }
    return DEFAULT_SETTINGS;
  }

  public updateStoreSettings(settings: Partial<StoreSettings>): StoreSettings {
    const tenantId = this.getTenantId();
    const current = this.getStoreSettings();
    const updated = { ...current, ...settings, tenant_id: tenantId, id: tenantId };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(updated));
    }
    this.broadcastChange();

    const payload = {
      id: tenantId,
      tenant_id: tenantId,
      store_name: updated.store_name,
      store_admin_name: updated.store_admin_name,
      store_address: updated.store_address,
      store_phone: updated.store_phone,
      receipt_header_note: updated.receipt_header_note,
      receipt_footer_note: updated.receipt_footer_note,
      tax_rate_percent: updated.tax_rate_percent,
      currency_symbol: updated.currency_symbol,
      enable_udhaar: updated.enable_udhaar,
      bank_name: updated.bank_name,
      account_number: updated.account_number,
      account_title: updated.account_title,
      easypaisa_number: updated.easypaisa_number,
      easypaisa_title: updated.easypaisa_title,
      qr_code_url: updated.qr_code_url,
      store_logo_url: updated.store_logo_url,
      updated_at: new Date().toISOString()
    };

    supabase.from('settings').upsert(payload).then(({ error }) => {
      if (error) this.enqueueOfflineMutation('upsert_settings', payload);
    }).catch(() => this.enqueueOfflineMutation('upsert_settings', payload));

    return updated;
  }

  // --- EXPENSES ---
  public async fetchExpenses(): Promise<Expense[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const uniqueMap = new Map<string, Expense>();
        data.forEach((e) => {
          const rec: Expense = {
            id: e.id,
            tenant_id: e.tenant_id || tenantId,
            title: e.title,
            amount: Number(e.amount || 0),
            category: e.category || 'General',
            notes: e.notes || '',
            cashier_name: e.cashier_name || 'Staff',
            created_at: e.created_at || new Date().toISOString()
          };
          const dateMinute = new Date(rec.created_at).toISOString().slice(0, 16);
          const contentKey = `${rec.title.trim().toLowerCase()}_${rec.amount}_${dateMinute}`;
          if (!uniqueMap.has(rec.id) && !uniqueMap.has(contentKey)) {
            uniqueMap.set(rec.id, rec);
            uniqueMap.set(contentKey, rec);
          }
        });
        const formatted = Array.from(new Set(uniqueMap.values()));

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('expenses'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchExpenses warning:', e);
    }
    return this.getExpenses();
  }

  public getExpenses(): Expense[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('expenses')) : null;
      if (stored) {
        const list: Expense[] = JSON.parse(stored);
        const uniqueMap = new Map<string, Expense>();
        list.forEach((e) => {
          const dateMinute = new Date(e.created_at).toISOString().slice(0, 16);
          const contentKey = `${e.title.trim().toLowerCase()}_${e.amount}_${dateMinute}`;
          if (!uniqueMap.has(e.id) && !uniqueMap.has(contentKey)) {
            uniqueMap.set(e.id, e);
            uniqueMap.set(contentKey, e);
          }
        });
        return Array.from(new Set(uniqueMap.values()));
      }
    } catch (e) {
      console.warn('Error reading expenses cache:', e);
    }
    return [];
  }

  public saveExpense(exp: Partial<Expense>): Expense {
    const tenantId = this.getTenantId();
    const lockKey = `expense_${(exp.title || '').trim().toLowerCase()}_${exp.amount || 0}_${exp.category || ''}`;
    const expenses = this.getExpenses();
    let updated: Expense;
    const now = new Date().toISOString();

    // Prevent duplicate expense submission within 4 seconds or locked in-flight
    if (!exp.id) {
      const isLocked = this.isOperationLocked(lockKey, 4000);
      const recentDuplicate = expenses.find((e) =>
        e.title.trim().toLowerCase() === (exp.title || '').trim().toLowerCase() &&
        e.amount === Number(exp.amount || 0) &&
        e.category === exp.category &&
        Math.abs(Date.now() - new Date(e.created_at).getTime()) < 4000
      );
      if (isLocked || recentDuplicate) {
        console.warn('Duplicate expense ignored within 4 seconds:', recentDuplicate || lockKey);
        if (recentDuplicate) return recentDuplicate;
      }
    }

    if (exp.id) {
      const idx = expenses.findIndex((e) => e.id === exp.id);
      if (idx !== -1) {
        expenses[idx] = { ...expenses[idx], ...exp, tenant_id: tenantId } as Expense;
        updated = expenses[idx];
      } else {
        updated = {
          id: exp.id,
          tenant_id: tenantId,
          title: exp.title || 'General Expense',
          amount: Number(exp.amount || 0),
          category: exp.category || 'General',
          notes: exp.notes || '',
          cashier_name: exp.cashier_name || 'Staff',
          created_at: exp.created_at || now
        };
        expenses.unshift(updated);
      }
    } else {
      updated = {
        id: `exp-${Date.now()}`,
        tenant_id: tenantId,
        title: exp.title || 'General Expense',
        amount: Number(exp.amount || 0),
        category: exp.category || 'General',
        notes: exp.notes || '',
        cashier_name: exp.cashier_name || 'Staff',
        created_at: now
      };
      expenses.unshift(updated);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('expenses'), JSON.stringify(expenses));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      title: updated.title,
      amount: updated.amount,
      category: updated.category,
      notes: updated.notes,
      cashier_name: updated.cashier_name
    };
    if (isUuidString(updated.id)) {
      payload.id = updated.id;
    }

    supabase.from('expenses').upsert(payload).then(({ error }) => {
      if (error) this.enqueueOfflineMutation('upsert_expense', payload);
    }).catch(() => this.enqueueOfflineMutation('upsert_expense', payload));

    return updated;
  }

  public deleteExpense(id: string): void {
    const expenses = this.getExpenses().filter((e) => e.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('expenses'), JSON.stringify(expenses));
    }
    this.broadcastChange();
    if (isUuidString(id)) {
      supabase.from('expenses').delete().eq('id', id).then(({ error }) => {
        if (error) this.enqueueOfflineMutation('delete_expense', { id });
      }).catch(() => this.enqueueOfflineMutation('delete_expense', { id }));
    }
  }

  // --- UDHAAR LOGS ---
  public async fetchUdhaarLogs(): Promise<UdhaarLog[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('udhaar_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const uniqueMap = new Map<string, UdhaarLog>();
        data.forEach((u) => {
          const rec: UdhaarLog = {
            id: u.id,
            tenant_id: u.tenant_id || tenantId,
            customer_id: u.customer_id,
            customer_name: u.customer_name,
            customer_phone: u.customer_phone || '',
            invoice_number: u.invoice_number || '',
            type: u.type as 'generate' | 'wasool',
            amount: Number(u.amount || 0),
            balance_after: Number(u.balance_after || 0),
            cashier_name: u.cashier_name || 'Cashier',
            notes: u.notes || '',
            created_at: u.created_at || new Date().toISOString()
          };
          const timeMs = new Date(rec.created_at).getTime();
          const contentKey = `${rec.customer_name}_${rec.amount}_${rec.type}_${rec.invoice_number}_${Math.floor(timeMs / 4000)}`;
          if (!uniqueMap.has(rec.id) && !uniqueMap.has(contentKey)) {
            uniqueMap.set(rec.id, rec);
            uniqueMap.set(contentKey, rec);
          }
        });
        const formatted = Array.from(new Set(uniqueMap.values()));

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('udhaar_logs'), JSON.stringify(formatted));
        }
        this.broadcastChange();
        return formatted;
      }
    } catch (e) {
      console.warn('Supabase fetchUdhaarLogs warning:', e);
    }
    return this.getUdhaarLogs();
  }

  public getUdhaarLogs(): UdhaarLog[] {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey('udhaar_logs')) : null;
      if (stored) {
        const list: UdhaarLog[] = JSON.parse(stored);
        const uniqueMap = new Map<string, UdhaarLog>();
        list.forEach((rec) => {
          const timeMs = new Date(rec.created_at).getTime();
          const contentKey = `${rec.customer_name}_${rec.amount}_${rec.type}_${rec.invoice_number}_${Math.floor(timeMs / 4000)}`;
          if (!uniqueMap.has(rec.id) && !uniqueMap.has(contentKey)) {
            uniqueMap.set(rec.id, rec);
            uniqueMap.set(contentKey, rec);
          }
        });
        return Array.from(new Set(uniqueMap.values()));
      }
    } catch (e) {
      console.warn('Error reading udhaar_logs cache:', e);
    }
    return [];
  }

  public recordUdhaarTransaction(data: {
    customer_id?: string;
    customer_name: string;
    customer_phone?: string;
    invoice_number?: string;
    type: 'generate' | 'wasool';
    amount: number;
    cashier_name?: string;
    notes?: string;
  }): UdhaarLog {
    const tenantId = this.getTenantId();
    const lockKey = `udhaar_${data.customer_name}_${data.amount}_${data.type}_${data.invoice_number || ''}`;
    const logs = this.getUdhaarLogs();

    const isLocked = this.isOperationLocked(lockKey, 4000);
    const recentDup = logs.find(l =>
      l.customer_name.trim().toLowerCase() === data.customer_name.trim().toLowerCase() &&
      l.amount === data.amount &&
      l.type === data.type &&
      l.invoice_number === (data.invoice_number || '') &&
      Math.abs(Date.now() - new Date(l.created_at).getTime()) < 4000
    );

    if (isLocked || recentDup) {
      console.warn('Duplicate udhaar transaction ignored within 4 seconds:', recentDup || lockKey);
      if (recentDup) return recentDup;
    }

    const customers = this.getCustomers();
    let targetCustomer: Customer | undefined;

    if (data.customer_id) {
      targetCustomer = customers.find((c) => c.id === data.customer_id);
    }

    const cleanPhoneDigits = (data.customer_phone || '').trim().replace(/\D/g, '');
    if (!targetCustomer && cleanPhoneDigits.length >= 7) {
      targetCustomer = customers.find((c) => c.phone && c.phone.replace(/\D/g, '') === cleanPhoneDigits);
    }

    if (!targetCustomer && data.customer_name) {
      const cleanN = data.customer_name.trim().toLowerCase();
      targetCustomer = customers.find((c) => c.name.trim().toLowerCase() === cleanN);
    }

    // Auto-create or retrieve customer without duplication
    if (!targetCustomer) {
      targetCustomer = this.saveCustomer({
        name: data.customer_name.trim() || 'New Customer',
        phone: data.customer_phone || '',
        credit_balance: 0,
        loyalty_points: 0
      });
    }

    const currentBalance = Number(targetCustomer.credit_balance || 0);
    const newBalance = data.type === 'generate'
      ? currentBalance + data.amount
      : Math.max(0, currentBalance - data.amount);

    // Update customer credit_balance (preserves targetCustomer.id and details)
    targetCustomer = this.saveCustomer({
      id: targetCustomer.id,
      name: targetCustomer.name,
      phone: targetCustomer.phone || data.customer_phone,
      credit_balance: newBalance
    });

    const newLog: UdhaarLog = {
      id: `ulog-${Date.now()}`,
      tenant_id: tenantId,
      customer_id: targetCustomer.id,
      customer_name: targetCustomer.name,
      customer_phone: targetCustomer.phone || data.customer_phone || '',
      invoice_number: data.invoice_number || '',
      type: data.type,
      amount: data.amount,
      balance_after: newBalance,
      cashier_name: data.cashier_name || 'Cashier',
      notes: data.notes || (data.type === 'generate' ? `Credit Bill ${data.invoice_number || ''}` : 'Udhaar Payment (Wasool) Received'),
      created_at: new Date().toISOString()
    };

    logs.unshift(newLog);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('udhaar_logs'), JSON.stringify(logs));
    }
    this.broadcastChange();

    const payload: any = {
      tenant_id: tenantId,
      customer_id: isUuidString(targetCustomer.id) ? targetCustomer.id : null,
      customer_name: newLog.customer_name,
      customer_phone: newLog.customer_phone,
      invoice_number: newLog.invoice_number,
      type: newLog.type,
      amount: newLog.amount,
      balance_after: newLog.balance_after,
      cashier_name: newLog.cashier_name,
      notes: newLog.notes
    };
    if (isUuidString(newLog.id)) {
      payload.id = newLog.id;
    }

    supabase.from('udhaar_logs').insert([payload]).then(({ error }) => {
      if (error) this.enqueueOfflineMutation('insert_udhaar_log', payload);
    }).catch(() => this.enqueueOfflineMutation('insert_udhaar_log', payload));

    return newLog;
  }
}

export const dbSync = new DbSyncEngine();
