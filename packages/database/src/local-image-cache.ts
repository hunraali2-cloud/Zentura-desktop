import { compressImage } from './image-compressor';

const DB_NAME = 'zentura_local_images_db';
const STORE_NAME = 'product_images';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject('IndexedDB not supported');
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveLocalImage(key: string, dataUrl: string): Promise<void> {
  if (!key || !dataUrl) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, key);
  } catch (e) {
    console.warn('Error saving local image to IndexedDB:', e);
  }
}

export async function getLocalImage(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function resolveLocalCachedImage(keys: (string | undefined | null)[]): Promise<string | null> {
  const validKeys = keys.filter(Boolean) as string[];
  for (const k of validKeys) {
    const cached = await getLocalImage(k);
    if (cached && (cached.startsWith('data:') || cached.startsWith('blob:'))) {
      return cached;
    }
  }
  return null;
}

export async function deleteLocalImage(key: string): Promise<void> {
  if (!key) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch (e) {
    console.warn('Error deleting local image:', e);
  }
}

export function extractGoogleDriveFileId(url?: string): string | null {
  if (!url) return null;
  const match =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Format Google Drive URLs into high-speed CDN direct image links
 */
export function formatGoogleDriveUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const fileId = extractGoogleDriveFileId(url);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }
  return url;
}

/**
 * Hybrid Image Pipeline:
 * 1. Checks local IndexedDB cache (0ms delay offline)
 * 2. If missing, fetches cloud URL (e.g. Google Drive), compresses it, and caches locally
 */
export async function resolveImagePipeline(
  productKey: string,
  cloudUrl?: string
): Promise<string | null> {
  if (!productKey && !cloudUrl) return null;

  const fileId = extractGoogleDriveFileId(cloudUrl);
  const keys = [productKey, fileId, cloudUrl].filter(Boolean) as string[];

  // Step 1: Check Local IndexedDB Cache (Instant Offline)
  const cached = await resolveLocalCachedImage(keys);
  if (cached) return cached;

  // Step 2: Formatted Cloud URL (Google Drive / CDN)
  const formattedUrl = formatGoogleDriveUrl(cloudUrl);
  if (!formattedUrl) return null;

  // Step 3: Background compress and cache for future offline usage
  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      compressImage(formattedUrl)
        .then((compressed) => {
          if (compressed && compressed.startsWith('data:')) {
            keys.forEach((k) => saveLocalImage(k, compressed));
          }
        })
        .catch(() => {});
    } catch (e) {
      // Ignore async caching errors
    }
  }

  return formattedUrl;
}

/**
 * Background catalog pre-cacher:
 * Downloads and caches all catalog product images into IndexedDB for offline reliability.
 */
export async function preloadAndCacheProductImages(
  products: Array<{ id?: string; barcode?: string; sku?: string; image_url?: string }>
): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine || !Array.isArray(products) || products.length === 0) {
    return;
  }

  for (const p of products) {
    if (!p.image_url) continue;
    const fileId = extractGoogleDriveFileId(p.image_url);
    const keys = [p.barcode, p.sku, p.id, fileId, p.image_url].filter(Boolean) as string[];

    const cached = await resolveLocalCachedImage(keys);
    if (!cached) {
      const formatted = formatGoogleDriveUrl(p.image_url);
      try {
        compressImage(formatted)
          .then((compressed) => {
            if (compressed && compressed.startsWith('data:')) {
              keys.forEach((k) => saveLocalImage(k, compressed));
            }
          })
          .catch(() => {});
      } catch {}
    }
  }
}
