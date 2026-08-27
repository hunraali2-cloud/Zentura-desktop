import React, { useState, useEffect } from 'react';
import {
  resolveLocalCachedImage,
  saveLocalImage,
  extractGoogleDriveFileId,
  formatGoogleDriveUrl
} from '@zentura/database';
import { Package } from 'lucide-react';

interface SmartImageProps {
  productKey?: string; // Product barcode, SKU, or ID
  src?: string;       // Cloud image URL (Google Drive / CDN) or data URL
  alt?: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  productKey,
  src,
  alt = 'Product image',
  className = 'w-full h-full object-cover',
  fallbackIcon
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState<number>(0);
  const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(false);
    setFallbackIndex(0);

    const load = async () => {
      try {
        const fileId = extractGoogleDriveFileId(src);
        const cacheKeys = [productKey, fileId, src].filter(Boolean) as string[];

        // 1. Direct raw src if data URL
        if (src && (src.startsWith('data:') || src.startsWith('blob:'))) {
          if (isMounted) {
            setImageSrc(src);
            setCandidateUrls([src]);
            setLoading(false);
          }
          // Save to IndexedDB
          cacheKeys.forEach((k) => saveLocalImage(k, src));
          return;
        }

        // 2. Check IndexedDB Local Cache (0ms instant offline support)
        const cached = await resolveLocalCachedImage(cacheKeys);
        if (cached && isMounted) {
          setImageSrc(cached);
          setCandidateUrls([cached]);
          setLoading(false);
          return;
        }

        // 3. Build candidate URLs for online loading
        const list: string[] = [];
        if (fileId) {
          list.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w800`);
          list.push(`https://lh3.googleusercontent.com/d/${fileId}`);
          list.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
        } else if (src) {
          list.push(formatGoogleDriveUrl(src));
        }

        if (isMounted) {
          if (list.length > 0) {
            setCandidateUrls(list);
            setImageSrc(list[0]);
          } else {
            setError(true);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [productKey, src]);

  const handleImageError = () => {
    const nextIdx = fallbackIndex + 1;
    if (nextIdx < candidateUrls.length) {
      setFallbackIndex(nextIdx);
      setImageSrc(candidateUrls[nextIdx]);
    } else {
      setError(true);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // If online and image loaded from URL, cache to IndexedDB for future offline usage
    if (typeof window !== 'undefined' && imageSrc && !imageSrc.startsWith('data:')) {
      const img = e.currentTarget;
      try {
        const fileId = extractGoogleDriveFileId(src);
        const cacheKeys = [productKey, fileId, src].filter(Boolean) as string[];

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.naturalWidth || 400, 600);
        canvas.height = Math.min(img.naturalHeight || 400, 600);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (dataUrl && dataUrl.startsWith('data:image')) {
            cacheKeys.forEach((k) => saveLocalImage(k, dataUrl));
          }
        }
      } catch (err) {
        // Tainted canvas or cross-origin restrictions on canvas export are ignored
      }
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse ${className}`}>
        <Package className="w-5 h-5 text-gray-400 opacity-50" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 ${className}`}>
        {fallbackIcon || <Package className="w-6 h-6 opacity-60" />}
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  );
};
