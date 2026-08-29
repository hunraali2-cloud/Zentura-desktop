import { dbSync } from './db-sync';
import { supabase } from './client';
import { compressImage } from './image-compressor';
import { saveLocalImage, getLocalImage, deleteLocalImage } from './local-image-cache';

export interface BackupRecord {
  id: string;
  fileName: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  status: 'local_download';
  itemCounts: {
    products: number;
    categories: number;
    invoices: number;
    stockLogs: number;
    users: number;
    customers?: number;
  };
}

export interface DriveApiFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
  webViewLink?: string;
}

const STORAGE_KEYS = {
  BACKUP_HISTORY: 'zentura_backup_history',
  LAST_BACKUP: 'zentura_last_backup_time',
};

class BackupService {
  private listeners: Set<() => void> = new Set();

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  // Compatibility stubs for any legacy references
  public isConnected(): boolean {
    return false;
  }

  public getConnectedEmail(): string {
    return '';
  }

  public setAccessToken(): void {}

  public disconnect(): void {}

  public getAccessToken(): string | null {
    return null;
  }

  public async loginWithGoogle(): Promise<boolean> {
    return false;
  }

  public getLastBackupTime(): string {
    if (typeof localStorage === 'undefined') return 'Never';
    return localStorage.getItem(STORAGE_KEYS.LAST_BACKUP) || 'Never';
  }

  public getBackupHistory(): BackupRecord[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const stored = localStorage.getItem(STORAGE_KEYS.BACKUP_HISTORY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Error reading backup history:', e);
    }
    return [];
  }

  public clearBackupHistory(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.BACKUP_HISTORY);
    this.notify();
  }

  private saveBackupRecord(record: BackupRecord) {
    if (typeof localStorage === 'undefined') return;
    const history = this.getBackupHistory();
    history.unshift(record);
    localStorage.setItem(STORAGE_KEYS.BACKUP_HISTORY, JSON.stringify(history.slice(0, 50)));
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, record.createdAt);
    this.notify();
  }

  // Local compressed image processing and storage
  public async uploadCompressedImageToDrive(
    fileOrBlob: File | Blob | string,
    fileName: string = `media_${Date.now()}`
  ): Promise<{ success: boolean; url: string; fileId?: string; error?: string }> {
    try {
      const compressedDataUrl = await compressImage(fileOrBlob, 800, 800, 0.75);
      if (!compressedDataUrl) {
        return { success: false, url: '', error: 'Failed to compress image.' };
      }

      await saveLocalImage(fileName, compressedDataUrl);

      return {
        success: true,
        url: compressedDataUrl,
        fileId: fileName
      };
    } catch (err: any) {
      console.warn('Image processing fallback:', err);
      const fallback = typeof fileOrBlob === 'string' ? fileOrBlob : '';
      return { success: true, url: fallback };
    }
  }

  // List all images present in the catalog
  public async listDriveImages(): Promise<Array<{ id: string; name: string; url: string; createdTime?: string }>> {
    const imagesMap = new Map<string, { id: string; name: string; url: string; createdTime?: string }>();

    try {
      const products = dbSync.getProducts();
      products.forEach((p) => {
        if (p.image_url) {
          imagesMap.set(p.image_url, {
            id: p.id,
            name: p.name || 'Product Image',
            url: p.image_url
          });
        }
      });
    } catch (e) {}

    return Array.from(imagesMap.values());
  }

  // Delete an image file from local cache and product catalog
  public async deleteDriveImage(fileIdOrKey: string): Promise<{ success: boolean; message: string }> {
    try {
      await deleteLocalImage(fileIdOrKey);

      try {
        const products = dbSync.getProducts();
        products.forEach((p) => {
          if (p.image_url && (p.image_url === fileIdOrKey || p.id === fileIdOrKey || p.barcode === fileIdOrKey)) {
            dbSync.saveProduct({
              ...p,
              image_url: undefined
            });
          }
        });
      } catch (e) {}

      return { success: true, message: 'Image removed successfully.' };
    } catch (err: any) {
      return { success: false, message: 'Failed to remove image: ' + (err?.message || '') };
    }
  }

  // Generate full database snapshot payload
  public generateBackupPayload() {
    const settings = dbSync.getStoreSettings();
    const tenantId = dbSync.getTenantId();
    const products = dbSync.getProducts();
    const categories = dbSync.getCategories();
    const invoices = dbSync.getInvoices();
    const stockLogs = dbSync.getStockLogs();
    const returns = dbSync.getReturns();
    const users = dbSync.getUsers();
    const customers = dbSync.getCustomers();
    const attendance = dbSync.getAttendanceLogs();

    return {
      version: '1.0.0',
      app: 'Zentura POS',
      store_name: settings.store_name || 'Store',
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      counts: {
        products: products.length,
        categories: categories.length,
        invoices: invoices.length,
        stock_logs: stockLogs.length,
        returns: returns.length,
        users: users.length,
        customers: customers.length,
        attendance: attendance.length
      },
      data: {
        settings,
        products,
        categories,
        invoices,
        stock_logs: stockLogs,
        returns,
        users,
        customers,
        attendance
      }
    };
  }

  // Direct Backup Download (.json)
  public async backupNow(): Promise<{
    success: boolean;
    uploadedToDrive: boolean;
    fileName: string;
    message: string;
    record?: BackupRecord;
  }> {
    const payload = this.generateBackupPayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const cleanStore = (payload.store_name || 'Store').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Zentura_Backup_${cleanStore}_${dateStr}.json`;
    const sizeBytes = new Blob([jsonString]).size;
    const sizeFormatted = sizeBytes > 1024 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(sizeBytes / 1024).toFixed(1)} KB`;

    // Trigger local browser / electron file download
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('File download error:', e);
    }

    const newRecord: BackupRecord = {
      id: `bk-${Date.now()}`,
      fileName,
      sizeBytes,
      sizeFormatted,
      createdAt: new Date().toLocaleString(),
      status: 'local_download',
      itemCounts: {
        products: payload.counts.products,
        categories: payload.counts.categories,
        invoices: payload.counts.invoices,
        stockLogs: payload.counts.stock_logs,
        users: payload.counts.users,
        customers: payload.counts.customers
      }
    };

    this.saveBackupRecord(newRecord);

    return {
      success: true,
      uploadedToDrive: false,
      fileName,
      message: 'Backup JSON file downloaded successfully to your device!',
      record: newRecord
    };
  }

  // Restore full database from parsed JSON backup object
  public async restoreDatabase(payload: any): Promise<{
    success: boolean;
    restoredCounts: { products: number; categories: number; invoices: number; stockLogs: number; users: number; customers: number };
    message: string;
  }> {
    try {
      if (!payload || !payload.data) {
        throw new Error('Invalid backup file format. Missing data root.');
      }

      const tenantId = dbSync.getTenantId();
      const { settings, products, categories, invoices, stock_logs, returns, users, customers, attendance } = payload.data;

      // 1. Restore into Local Storage caches
      if (typeof localStorage !== 'undefined') {
        if (products && Array.isArray(products)) {
          localStorage.setItem(`zentura_sync_${tenantId}_products`, JSON.stringify(products));
        }
        if (categories && Array.isArray(categories)) {
          localStorage.setItem(`zentura_sync_${tenantId}_categories`, JSON.stringify(categories));
        }
        if (invoices && Array.isArray(invoices)) {
          localStorage.setItem(`zentura_sync_${tenantId}_invoices`, JSON.stringify(invoices));
        }
        if (stock_logs && Array.isArray(stock_logs)) {
          localStorage.setItem(`zentura_sync_${tenantId}_stock_logs`, JSON.stringify(stock_logs));
        }
        if (returns && Array.isArray(returns)) {
          localStorage.setItem(`zentura_sync_${tenantId}_returns`, JSON.stringify(returns));
        }
        if (users && Array.isArray(users)) {
          localStorage.setItem(`zentura_sync_${tenantId}_users`, JSON.stringify(users));
        }
        if (customers && Array.isArray(customers)) {
          localStorage.setItem(`zentura_sync_${tenantId}_customers`, JSON.stringify(customers));
        }
        if (attendance && Array.isArray(attendance)) {
          localStorage.setItem(`zentura_sync_${tenantId}_attendance`, JSON.stringify(attendance));
        }
        if (settings) {
          localStorage.setItem(`zentura_sync_${tenantId}_settings`, JSON.stringify(settings));
        }
      }

      // 2. Push restored data to Supabase Cloud in background
      try {
        if (products && products.length > 0) {
          await supabase.from('products').upsert(products.map((p: any) => ({ ...p, tenant_id: tenantId })), { onConflict: 'id' });
        }
        if (categories && categories.length > 0) {
          await supabase.from('categories').upsert(categories.map((c: any) => ({ ...c, tenant_id: tenantId })), { onConflict: 'id' });
        }
        if (invoices && invoices.length > 0) {
          await supabase.from('invoices').upsert(invoices.map((i: any) => ({ ...i, tenant_id: tenantId })), { onConflict: 'id' });
        }
        if (settings) {
          await supabase.from('settings').upsert({ ...settings, id: tenantId, tenant_id: tenantId });
        }
      } catch (sbErr) {
        console.warn('Supabase cloud restore notice:', sbErr);
      }

      // 3. Broadcast sync event to all open tabs / windows
      if (typeof window !== 'undefined' && (window as any).BroadcastChannel) {
        try {
          const channel = new BroadcastChannel('zentura-db-live-sync');
          channel.postMessage({ type: 'DATABASE_RESTORED', tenantId });
        } catch {}
      }

      const restoredCounts = {
        products: products?.length || 0,
        categories: categories?.length || 0,
        invoices: invoices?.length || 0,
        stockLogs: stock_logs?.length || 0,
        users: users?.length || 0,
        customers: customers?.length || 0
      };

      return {
        success: true,
        restoredCounts,
        message: `Database successfully restored (${restoredCounts.products} products, ${restoredCounts.invoices} invoices, ${restoredCounts.categories} categories)!`
      };
    } catch (err: any) {
      return {
        success: false,
        restoredCounts: { products: 0, categories: 0, invoices: 0, stockLogs: 0, users: 0, customers: 0 },
        message: err?.message || 'Failed to restore database.'
      };
    }
  }
}

export const backupService = new BackupService();
export const googleDriveService = backupService;

