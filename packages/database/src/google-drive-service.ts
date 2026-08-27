import { dbSync } from './db-sync';
import { supabase } from './client';
import { compressImage } from './image-compressor';
import { saveLocalImage, formatGoogleDriveUrl } from './local-image-cache';

export interface BackupRecord {
  id: string;
  fileName: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  driveFileId?: string;
  driveViewLink?: string;
  status: 'uploaded_to_drive' | 'local_download';
  itemCounts: {
    products: number;
    categories: number;
    invoices: number;
    stockLogs: number;
    users: number;
  };
}

export interface DriveApiFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
  webViewLink?: string;
}

const getEnvVar = (key: string, fallback: string = ''): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return fallback;
};

export const GOOGLE_OAUTH_CONFIG = {
  get DESKTOP_CLIENT_ID(): string {
    return (
      getEnvVar('VITE_GOOGLE_DRIVE_DESKTOP_CLIENT_ID') ||
      getEnvVar('GOOGLE_DRIVE_DESKTOP_CLIENT_ID') ||
      getEnvVar('VITE_GOOGLE_DRIVE_CLIENT_ID') ||
      getEnvVar('NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID') ||
      ''
    );
  },
  get WEB_CLIENT_ID(): string {
    return (
      getEnvVar('VITE_GOOGLE_DRIVE_CLIENT_ID') ||
      getEnvVar('NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID') ||
      getEnvVar('GOOGLE_DRIVE_WEB_CLIENT_ID') ||
      ''
    );
  },
  SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'
};

const STORAGE_KEYS = {
  OAUTH_TOKEN: 'zentura_gdrive_access_token',
  TOKEN_EXPIRY: 'zentura_gdrive_token_expiry',
  USER_EMAIL: 'zentura_gdrive_user_email',
  BACKUP_HISTORY: 'zentura_gdrive_backup_history',
  LAST_BACKUP: 'zentura_last_backup_time',
  AUTO_BACKUP: 'zentura_auto_daily_download'
};

class GoogleDriveService {
  private listeners: Set<() => void> = new Set();
  private tokenClient: any = null;

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public isConnected(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const token = localStorage.getItem(STORAGE_KEYS.OAUTH_TOKEN);
    const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    if (!token) return false;
    if (expiry && Number(expiry) < Date.now()) {
      return false;
    }
    return true;
  }

  public getConnectedEmail(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEYS.USER_EMAIL) || 'Google Drive User';
  }

  public setAccessToken(token: string, expiresInSeconds: number = 3600, email: string = ''): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.OAUTH_TOKEN, token.trim());
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, (Date.now() + expiresInSeconds * 1000).toString());
    if (email) localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    this.notify();

    // Fetch user profile email asynchronously if missing
    if (!email && token) {
      this.fetchUserEmail(token).then((fetchedEmail) => {
        if (fetchedEmail) {
          localStorage.setItem(STORAGE_KEYS.USER_EMAIL, fetchedEmail);
          this.notify();
        }
      }).catch(() => {});
    }
  }

  private async fetchUserEmail(token: string): Promise<string> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.email || '';
      }
    } catch {}
    return '';
  }

  public disconnect(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.OAUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    this.notify();
  }

  public getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.OAUTH_TOKEN);
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

  private saveBackupRecord(record: BackupRecord) {
    if (typeof localStorage === 'undefined') return;
    const history = this.getBackupHistory();
    history.unshift(record);
    localStorage.setItem(STORAGE_KEYS.BACKUP_HISTORY, JSON.stringify(history.slice(0, 30)));
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, record.createdAt);
    this.notify();
  }

  // 1-Click Google OAuth Authorization Trigger
  public async loginWithGoogle(isDesktop: boolean = false): Promise<boolean> {
    return new Promise((resolve) => {
      const clientId = isDesktop ? GOOGLE_OAUTH_CONFIG.DESKTOP_CLIENT_ID : GOOGLE_OAUTH_CONFIG.WEB_CLIENT_ID;

      // Method 1: Google Identity Services (GSI) Token Client if script loaded
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_OAUTH_CONFIG.SCOPES,
            callback: (res: any) => {
              if (res.access_token) {
                this.setAccessToken(res.access_token, res.expires_in || 3600);
                resolve(true);
              } else {
                resolve(false);
              }
            }
          });
          client.requestAccessToken();
          return;
        } catch (err) {
          console.warn('GSI initTokenClient fallback to popup:', err);
        }
      }

      // Method 2: OAuth 2.0 Popup Window with instant postMessage listener
      if (typeof window !== 'undefined') {
        const redirectUri = window.location.origin;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(GOOGLE_OAUTH_CONFIG.SCOPES)}&prompt=consent`;

        let resolved = false;

        const handleMessage = (event: MessageEvent) => {
          if (event.data && event.data.type === 'GOOGLE_AUTH_TOKEN' && event.data.token) {
            window.removeEventListener('message', handleMessage);
            resolved = true;
            this.setAccessToken(event.data.token, event.data.expiresIn || 3600);
            resolve(true);
          }
        };

        window.addEventListener('message', handleMessage);

        const popup = window.open(authUrl, 'GoogleAuth', 'width=550,height=650');
        const interval = setInterval(() => {
          if (resolved) {
            clearInterval(interval);
            return;
          }
          if (!popup || popup.closed) {
            clearInterval(interval);
            window.removeEventListener('message', handleMessage);
            resolve(this.isConnected());
          }
        }, 500);
      } else {
        resolve(false);
      }
    });
  }

  // Upload compressed image to Google Drive and return direct viewable CDN URL
  public async uploadCompressedImageToDrive(
    fileOrBlob: File | Blob | string,
    fileName: string = `media_${Date.now()}`
  ): Promise<{ success: boolean; url: string; fileId?: string; error?: string }> {
    try {
      // Step 1: Compress image to WebP format (< 40 KB)
      const compressedDataUrl = await compressImage(fileOrBlob, 800, 800, 0.75);
      if (!compressedDataUrl) {
        return { success: false, url: '', error: 'Failed to compress image.' };
      }

      const token = this.getAccessToken();

      // If Google Drive is not connected, store in IndexedDB and return data URL
      if (!token) {
        saveLocalImage(fileName, compressedDataUrl);
        return {
          success: true,
          url: compressedDataUrl,
          error: 'Google Drive not connected. Saved in offline local cache.'
        };
      }

      // Convert Data URL to Blob
      const parts = compressedDataUrl.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const imageBlob = new Blob([ab], { type: mimeString });

      // Step 2: Upload to Google Drive
      const metadata = {
        name: `${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}.webp`,
        mimeType: mimeString,
        description: 'Zentura POS Compressed Media Asset'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' }));
      form.append('file', imageBlob);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: form
        }
      );

      if (!uploadRes.ok) {
        if (uploadRes.status === 401) this.disconnect();
        saveLocalImage(fileName, compressedDataUrl);
        return { success: true, url: compressedDataUrl };
      }

      const fileData = await uploadRes.json();
      const fileId = fileData.id;

      // Step 3: Grant public read permission so all cashier screens and receipts can render it
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (permErr) {
        console.warn('Google Drive permission notice:', permErr);
      }

      // Step 4: High-speed Google CDN Direct Image Link
      const directCdnUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;

      // Save locally to IndexedDB for 0ms instant loading
      saveLocalImage(fileName, compressedDataUrl);
      saveLocalImage(fileId, compressedDataUrl);

      return {
        success: true,
        url: directCdnUrl,
        fileId: fileId
      };
    } catch (err: any) {
      console.warn('Google Drive image upload fallback:', err);
      const fallback = typeof fileOrBlob === 'string' ? fileOrBlob : '';
      return { success: true, url: fallback };
    }
  }

  // List all available images from Google Drive & previously uploaded product catalog
  public async listDriveImages(): Promise<Array<{ id: string; name: string; url: string; createdTime?: string }>> {
    const imagesMap = new Map<string, { id: string; name: string; url: string; createdTime?: string }>();

    // 1. Collect all images already in local product catalog
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

    // 2. Fetch images from Google Drive if connected
    const token = this.getAccessToken();
    if (token) {
      try {
        const query = encodeURIComponent("mimeType contains 'image/' and trashed = false");
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,thumbnailLink)&pageSize=100&orderBy=createdTime desc`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.files && Array.isArray(data.files)) {
            for (const file of data.files) {
              const url = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s800') : `https://drive.google.com/thumbnail?id=${file.id}&sz=w800`;
              const cleanName = file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') : 'Image Asset';
              imagesMap.set(file.id, {
                id: file.id,
                name: cleanName,
                url: url,
                createdTime: file.createdTime
              });

              // Background fetch media with auth token and store in IndexedDB for 0ms resilient display
              getLocalImage(file.id).then((cached) => {
                if (!cached) {
                  fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                    headers: { Authorization: `Bearer ${token}` }
                  })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          saveLocalImage(file.id, reader.result);
                        }
                      };
                      reader.readAsDataURL(blob);
                    })
                    .catch(() => {});
                }
              }).catch(() => {});
            }
          }
        } else if (res.status === 401) {
          this.disconnect();
        }
      } catch (err) {
        console.warn('Error fetching Google Drive images:', err);
      }
    }

    return Array.from(imagesMap.values());
  }

  // Delete an image file from Google Drive and local cache
  public async deleteDriveImage(fileIdOrKey: string): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Delete from local IndexedDB cache
      await deleteLocalImage(fileIdOrKey);

      // 2. If it is a Google Drive file ID, delete from Drive
      const token = this.getAccessToken();
      const fileId = extractGoogleDriveFileId(fileIdOrKey) || fileIdOrKey;

      if (token && fileId && !fileId.startsWith('data:') && !fileId.startsWith('blob:')) {
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
        } catch (e) {
          console.warn('Drive deletion error:', e);
        }
      }

      // 3. Clear image from any products using it
      try {
        const products = dbSync.getProducts();
        products.forEach((p) => {
          if (p.image_url && (p.image_url.includes(fileId) || p.image_url === fileIdOrKey || p.id === fileIdOrKey || p.barcode === fileIdOrKey)) {
            dbSync.saveProduct({
              ...p,
              image_url: undefined
            });
          }
        });
      } catch (e) {}

      return { success: true, message: 'Image deleted successfully.' };
    } catch (err: any) {
      return { success: false, message: 'Failed to delete image: ' + (err?.message || '') };
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

  // Upload database backup directly to Google Drive via multipart upload
  public async uploadToGoogleDrive(
    fileName: string,
    jsonContent: string
  ): Promise<{ success: boolean; fileId?: string; viewLink?: string; error?: string }> {
    const token = this.getAccessToken();
    if (!token) {
      return { success: false, error: 'Google Drive is not connected. Please connect your Google account.' };
    }

    try {
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        description: `Zentura POS Database Backup - ${new Date().toLocaleString()}`
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonContent +
        closeDelim;

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartRequestBody
        }
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.disconnect();
          return { success: false, error: 'Google session expired. Please reconnect Google Drive.' };
        }
        return { success: false, error: errJson?.error?.message || `Google Drive Error (${response.status})` };
      }

      const result = await response.json();
      return {
        success: true,
        fileId: result.id,
        viewLink: result.webViewLink
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error connecting to Google Drive.' };
    }
  }

  // List existing backup files on connected Google Drive
  public async listDriveBackups(): Promise<DriveApiFile[]> {
    const token = this.getAccessToken();
    if (!token) return [];

    try {
      const q = encodeURIComponent("name contains 'Zentura_Backup' and trashed=false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime%20desc&pageSize=20`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        return data.files || [];
      } else if (res.status === 401) {
        this.disconnect();
      }
    } catch (e) {
      console.warn('Error listing Google Drive backups:', e);
    }
    return [];
  }

  // Download raw backup file content from Google Drive
  public async downloadDriveBackup(fileId: string): Promise<any | null> {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Error downloading backup from Drive:', e);
    }
    return null;
  }

  // Backup Now: Uploads to Google Drive + triggers local file download
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

    let uploadedToDrive = false;
    let driveFileId: string | undefined;
    let driveViewLink: string | undefined;

    // 1. If Google Drive is connected, upload to Drive
    if (this.isConnected()) {
      const driveRes = await this.uploadToGoogleDrive(fileName, jsonString);
      if (driveRes.success) {
        uploadedToDrive = true;
        driveFileId = driveRes.fileId;
        driveViewLink = driveRes.viewLink;
      }
    }

    // 2. Always download local fallback copy to user's device
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
      console.warn('Local download fallback notice:', e);
    }

    const newRecord: BackupRecord = {
      id: `bk-${Date.now()}`,
      fileName,
      sizeBytes,
      sizeFormatted,
      createdAt: new Date().toLocaleString(),
      driveFileId,
      driveViewLink,
      status: uploadedToDrive ? 'uploaded_to_drive' : 'local_download',
      itemCounts: {
        products: payload.counts.products,
        categories: payload.counts.categories,
        invoices: payload.counts.invoices,
        stockLogs: payload.counts.stock_logs,
        users: payload.counts.users
      }
    };

    this.saveBackupRecord(newRecord);

    return {
      success: true,
      uploadedToDrive,
      fileName,
      message: uploadedToDrive
        ? 'Backup successfully saved to Google Drive and downloaded locally!'
        : 'Backup downloaded locally. Connect Google Drive for automatic cloud synchronization.',
      record: newRecord
    };
  }

  // Restore full database from backup JSON object
  public async restoreDatabase(payload: any): Promise<{
    success: boolean;
    restoredCounts: { products: number; categories: number; invoices: number; stockLogs: number; users: number };
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
        users: users?.length || 0
      };

      return {
        success: true,
        restoredCounts,
        message: `Database successfully restored (${restoredCounts.products} products, ${restoredCounts.invoices} invoices, ${restoredCounts.categories} categories)!`
      };
    } catch (err: any) {
      return {
        success: false,
        restoredCounts: { products: 0, categories: 0, invoices: 0, stockLogs: 0, users: 0 },
        message: err?.message || 'Failed to restore database.'
      };
    }
  }
}

export const googleDriveService = new GoogleDriveService();
