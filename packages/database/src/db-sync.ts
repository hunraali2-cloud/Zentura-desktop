import { supabase } from './client';
import { Product, Invoice, StockLog, Attendance, StoreSettings, ReturnRecord, User, Category, Customer } from './types';

const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'Zentura POS Store',
  store_admin_name: 'Store Admin',
  store_address: 'Commercial Plaza, Main Branch',
  store_phone: '+92 (051) 111-936-887',
  receipt_header_note: 'Welcome to our store',
  receipt_footer_note: 'Thank you for shopping with us! Powered by Zentura POS',
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

class DbSyncEngine {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<() => void> = new Set();
  private tenantId: string = 't-1';

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedTenant = localStorage.getItem('zentura_active_tenant_id');
      if (savedTenant) {
        this.tenantId = savedTenant;
      }
    }
    this.initSyncChannel();
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
        const formatted: Product[] = data.map((p) => ({
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
        }));

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey('products'), JSON.stringify(formatted));
        }
        this.broadcastChange();
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
      if (stored) return JSON.parse(stored);
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

    if (product.id) {
      const idx = products.findIndex((p) => p.id === product.id || (product.barcode && p.barcode === product.barcode));
      if (idx !== -1) {
        products[idx] = { ...products[idx], ...product, tenant_id: tenantId } as Product;
        updatedProduct = products[idx];
      } else {
        updatedProduct = {
          id: product.id,
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
    } else {
      updatedProduct = {
        id: `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
        created_at: now
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

    supabase
      .from('products')
      .upsert(payload)
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) console.warn('Supabase product save warning:', error);
        else if (data) {
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
      });

    return updatedProduct;
  }

  public deleteProduct(id: string): void {
    const products = this.getProducts().filter((p) => p.id !== id && p.barcode !== id && p.sku !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('products'), JSON.stringify(products));
    }
    this.broadcastChange();

    if (isUuidString(id)) {
      supabase.from('products').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('Supabase delete product warning:', error);
      });
    } else {
      supabase.from('products').delete().eq('barcode', id).then();
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

    supabase.from('categories').upsert(payload).then();

    return updatedCat;
  }

  public deleteCategory(id: string): void {
    const categories = this.getCategories().filter((c) => c.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(categories));
    }
    this.broadcastChange();
    if (isUuidString(id)) {
      supabase.from('categories').delete().eq('id', id).then();
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
          console.warn('Supabase user save error:', error);
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

    if (isUuidString(targetId)) {
      supabase.from('users').delete().eq('id', targetId).then(({ error }) => {
        if (error) console.warn('Supabase delete user by id error:', error);
      });
    }
    if (targetEmail) {
      supabase.from('users').delete().eq('email', targetEmail.trim().toLowerCase()).then(({ error }) => {
        if (error) console.warn('Supabase delete user by email error:', error);
      });
    }
  }

  public authenticateCashierByPin(pin: string): User | null {
    const cleanPin = pin.trim();
    const users = this.getUsers();
    const found = users.find((u) => u.pin_code && u.pin_code.trim() === cleanPin);
    return found || null;
  }

  // --- CUSTOMERS ---
  public async fetchCustomers(): Promise<Customer[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (!error && data) {
        const formatted: Customer[] = data.map((c) => ({
          id: c.id,
          tenant_id: c.tenant_id || tenantId,
          name: c.name,
          email: c.email || '',
          phone: c.phone || '',
          loyalty_points: Number(c.loyalty_points || 0),
          credit_balance: Number(c.credit_balance || 0),
          created_at: c.created_at || new Date().toISOString()
        }));

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
      if (stored) return JSON.parse(stored);
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

    if (cust.id) {
      const idx = customers.findIndex((c) => c.id === cust.id);
      if (idx !== -1) {
        customers[idx] = { ...customers[idx], ...cust, tenant_id: tenantId } as Customer;
        updated = customers[idx];
      } else {
        updated = { id: cust.id, tenant_id: tenantId, name: cust.name || 'Customer', email: cust.email, phone: cust.phone, loyalty_points: cust.loyalty_points || 0, credit_balance: cust.credit_balance || 0, created_at: now };
        customers.push(updated);
      }
    } else {
      updated = { id: `cust-${Date.now()}`, tenant_id: tenantId, name: cust.name || 'Customer', email: cust.email, phone: cust.phone, loyalty_points: cust.loyalty_points || 0, credit_balance: cust.credit_balance || 0, created_at: now };
      customers.push(updated);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(customers));
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

    supabase.from('customers').upsert(payload).then();

    return updated;
  }

  public deleteCustomer(id: string): void {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('customers'), JSON.stringify(customers));
    }
    this.broadcastChange();
    if (isUuidString(id)) {
      supabase.from('customers').delete().eq('id', id).then();
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
        const formatted: Invoice[] = data.map((i) => ({
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
          created_at: i.created_at || new Date().toISOString()
        }));

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
      if (stored) return JSON.parse(stored);
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
    const invoices = this.getInvoices();
    const newInvoice: Invoice = {
      ...invoiceData,
      tenant_id: tenantId,
      id: `inv-${Date.now()}`,
      created_at: new Date().toISOString()
    };

    invoices.unshift(newInvoice);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('invoices'), JSON.stringify(invoices));
    }

    // Deduct stock for sold items
    const products = this.getProducts();
    items.forEach((item) => {
      const prod = products.find((p) => p.id === item.product_id || p.barcode === item.product_id || p.sku === item.product_id);
      if (prod) {
        prod.stock_qty = Math.max(0, prod.stock_qty - item.qty);
      }
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStorageKey('products'), JSON.stringify(products));
    }

    this.broadcastChange();

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
      status: newInvoice.status
    };
    if (isUuidString(newInvoice.id)) {
      payload.id = newInvoice.id;
    }

    supabase.from('invoices').insert([payload]).then(({ error }) => {
      if (error) console.warn('Supabase invoice insert warning:', error);
    });

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
        const formatted: ReturnRecord[] = data.map((r) => ({
          id: r.id,
          tenant_id: r.tenant_id || tenantId,
          invoice_number: r.invoice_number,
          customer_detail: r.customer_detail || 'Walk-in Customer',
          refund_amount: Number(r.refund_amount || 0),
          reason: r.reason || 'Customer Return',
          processed_by: r.processed_by || 'Manager',
          created_at: r.created_at || new Date().toISOString()
        }));

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
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading returns cache:', e);
    }
    return [];
  }

  public processReturn(invoiceNumber: string, reason: string, refundAmount: number, processedBy: string): ReturnRecord {
    const tenantId = this.getTenantId();
    const returns = this.getReturns();
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

    supabase.from('returns').insert([payload]).then();
    supabase.from('invoices').update({ status: 'refunded' }).eq('invoice_number', invoiceNumber).then();

    return newReturn;
  }

  // --- STOCK LOGS ---
  public async fetchStockLogs(): Promise<StockLog[]> {
    const tenantId = this.getTenantId();
    try {
      const { data, error } = await supabase
        .from('stock_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted: StockLog[] = data.map((s) => ({
          id: s.id,
          tenant_id: s.tenant_id || tenantId,
          product_id: s.product_id,
          cashier_id: s.cashier_id || 'Cashier #01',
          change_qty: Number(s.change_qty || 0),
          reason: s.reason || 'Stock Update',
          locked: s.locked ?? true,
          created_at: s.created_at || new Date().toISOString()
        }));

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
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading stock logs cache:', e);
    }
    return [];
  }

  public createStockLog(log: Omit<StockLog, 'id' | 'created_at'>): StockLog {
    const tenantId = this.getTenantId();
    const logs = this.getStockLogs();
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

    supabase.from('stock_logs').insert([payload]).then();

    return newLog;
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
        const formatted: Attendance[] = data.map((a) => ({
          id: a.id,
          tenant_id: a.tenant_id || tenantId,
          user_id: a.user_id,
          clock_in: a.clock_in,
          clock_out: a.clock_out,
          device_uuid: a.device_uuid,
          created_at: a.created_at || new Date().toISOString()
        }));

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
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading attendance cache:', e);
    }
    return [];
  }

  public clockInUser(userId: string): Attendance {
    const tenantId = this.getTenantId();
    const logs = this.getAttendanceLogs();
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

    supabase.from('attendance').insert([payload]).then();

    return newLog;
  }

  public clockOutUser(attendanceId: string): void {
    const logs = this.getAttendanceLogs();
    const log = logs.find((l) => l.id === attendanceId || l.user_id === attendanceId);
    if (log && !log.clock_out) {
      log.clock_out = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getStorageKey('attendance'), JSON.stringify(logs));
      }
      this.broadcastChange();
      if (isUuidString(log.id)) {
        supabase.from('attendance').update({ clock_out: log.clock_out }).eq('id', log.id).then();
      } else {
        supabase.from('attendance').update({ clock_out: log.clock_out }).eq('user_id', log.user_id).then();
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
        const formatted: StoreSettings = {
          id: data.id || tenantId,
          tenant_id: tenantId,
          store_name: data.store_name || DEFAULT_SETTINGS.store_name,
          store_admin_name: data.store_admin_name || DEFAULT_SETTINGS.store_admin_name,
          store_address: data.store_address || DEFAULT_SETTINGS.store_address,
          store_phone: data.store_phone || DEFAULT_SETTINGS.store_phone,
          receipt_header_note: data.receipt_header_note || DEFAULT_SETTINGS.receipt_header_note,
          receipt_footer_note: data.receipt_footer_note || DEFAULT_SETTINGS.receipt_footer_note,
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
      if (stored) return JSON.parse(stored);
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

    supabase.from('settings').upsert({
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
    }).then();

    return updated;
  }
}

export const dbSync = new DbSyncEngine();
