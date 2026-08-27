import React, { useState, useEffect, useMemo } from 'react';
import { PackagePlus, ShieldCheck, QrCode, Images, Upload, RefreshCw, Image as ImageIcon, X, Trash2, Search, CheckCircle2 } from 'lucide-react';
import { dbSync, StockLog, User, googleDriveService, saveLocalImage, formatGoogleDriveUrl } from '@zentura/database';
import { SmartImage } from '../components/SmartImage';

interface StockInwardViewProps {
  cashier?: User | null;
}

export const StockInwardView: React.FC<StockInwardViewProps> = ({ cashier }) => {
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState<string>('');
  const [costPrice, setCostPrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Gallery Modal
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; url: string; createdTime?: string }>>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');

  const [logs, setLogs] = useState<StockLog[]>(dbSync.getStockLogs());
  const [toast, setToast] = useState('');

  useEffect(() => {
    const loadLogs = () => {
      setLogs(dbSync.getStockLogs());
    };
    loadLogs();
    dbSync.fetchStockLogs().then(setLogs);
    const unsubscribe = dbSync.subscribe(loadLogs);
    return () => unsubscribe();
  }, []);

  const handleOpenGallery = async () => {
    setShowGalleryModal(true);
    setLoadingGallery(true);
    try {
      const list = await googleDriveService.listDriveImages();
      setGalleryImages(list);
    } catch (err) {
      console.warn('Failed to load gallery images:', err);
    } finally {
      setLoadingGallery(false);
    }
  };

  const filteredGalleryImages = useMemo(() => {
    const q = gallerySearch.toLowerCase().trim();
    if (!q) return galleryImages;
    return galleryImages.filter((img) => img.name.toLowerCase().includes(q));
  }, [galleryImages, gallerySearch]);

  const handleDeleteGalleryImage = async (id: string, name: string) => {
    if (!confirm(`Delete image from Google Drive and media library?`)) return;
    try {
      await googleDriveService.deleteDriveImage(id);
      if (imagePreview && (imagePreview.includes(id) || imagePreview === id)) {
        setImagePreview(null);
      }
      setGalleryImages((prev) => prev.filter((img) => img.id !== id && !img.url.includes(id)));
    } catch (err) {
      console.warn('Failed to delete image:', err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingImg(true);
      try {
        const res = await googleDriveService.uploadCompressedImageToDrive(file, `prod_${barcode || Date.now()}`);
        if (res.url) {
          setImagePreview(res.url);
        }
      } catch (err) {
        console.warn('Image upload error:', err);
      } finally {
        setUploadingImg(false);
      }
    }
  };

  const handleConfirmAndLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !barcode.trim() || !productName.trim() || !quantity) return;

    setIsSubmitting(true);
    try {
      const qty = parseInt(quantity) || 1;
      const prodBarcode = barcode.trim();

      let finalImg = imagePreview || undefined;
      if (finalImg) {
        finalImg = formatGoogleDriveUrl(finalImg);
      }

      // 1. Create stock log
      dbSync.createStockLog({
        tenant_id: dbSync.getTenantId(),
        product_id: prodBarcode,
        cashier_id: cashier ? cashier.name : 'Cashier #01',
        change_qty: qty,
        reason: `Intake: ${supplier || 'Local Supplier'}`,
        locked: true
      });

      // 2. Also ensure product exists / updates in product store with accumulated stock
      const existingProduct = dbSync.getProducts().find(
        (p) => p.barcode === prodBarcode || (p.sku && p.sku === prodBarcode) || p.id === prodBarcode
      );
      const newTotalStock = (existingProduct ? Number(existingProduct.stock_qty || 0) : 0) + qty;

      const saved = dbSync.saveProduct({
        barcode: prodBarcode,
        sku: sku || existingProduct?.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        name: productName.trim(),
        retail_price: parseFloat(retailPrice) || existingProduct?.retail_price || 0,
        cost_price: parseFloat(costPrice) || existingProduct?.cost_price || 0,
        stock_qty: newTotalStock,
        image_url: finalImg || existingProduct?.image_url,
        tenant_id: dbSync.getTenantId()
      });

      if (imagePreview) {
        const keys = [saved.barcode, saved.sku, saved.id, finalImg].filter(Boolean) as string[];
        keys.forEach((k) => saveLocalImage(k, imagePreview));
      }

      setLogs(dbSync.getStockLogs());
      setBarcode('');
      setProductName('');
      setSku('');
      setQuantity('');
      setCostPrice('');
      setRetailPrice('');
      setSupplier('');
      setImagePreview(null);
      setToast('Stock & product image saved successfully.');
      setTimeout(() => setToast(''), 3500);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  };

  return (
    <div className="flex-1 flex gap-6 p-6 overflow-hidden h-[calc(100vh-64px)] animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 bg-[#10B981] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold">
          <ShieldCheck className="w-5 h-5" />
          {toast}
        </div>
      )}

      {/* Left Column: Form */}
      <div className="w-[460px] bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="p-2.5 bg-[#4F46E5]/10 rounded-xl text-[#4F46E5]">
              <PackagePlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Add Product Stock</h2>
              <p className="text-xs text-[#64748B]">Scan product barcode or enter details below</p>
            </div>
          </div>

          <form onSubmit={handleConfirmAndLock} className="space-y-3.5 mt-5">
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Product Barcode *
              </label>
              <div className="relative">
                <QrCode className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  placeholder="Scan barcode or type here..."
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Organic Coffee Beans 1Kg"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                  Product SKU (Optional)
                </label>
                <input
                  type="text"
                  placeholder="SKU-1001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                  Quantity to Add *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums font-bold text-[#10B981]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                  Retail Price (Rs.)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                  Cost Price (Rs.)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Supplier Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Wholesale Supplies"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            {/* Product Image Upload & Gallery Selection */}
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1.5">
                Product Image
              </label>

              <div className="flex items-center gap-3 border border-dashed border-[#CBD5E1] p-3 rounded-xl bg-[#F8FAFC]">
                {uploadingImg ? (
                  <div className="w-14 h-14 bg-[#4F46E5]/10 rounded-xl border border-[#4F46E5]/30 flex items-center justify-center text-[#4F46E5] shrink-0">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                ) : imagePreview ? (
                  <div className="relative w-14 h-14 shrink-0">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      className="w-14 h-14 object-cover rounded-xl border border-[#E2E8F0] bg-white shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setImagePreview(null)}
                      className="absolute -top-1.5 -right-1.5 bg-[#F43F5E] hover:bg-[#E11D48] text-white p-0.5 rounded-full shadow-xs cursor-pointer"
                      title="Remove Image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#64748B] shrink-0">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs rounded-lg cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Upload Image
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/gif, image/svg+xml, image/*"
                        disabled={uploadingImg}
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenGallery}
                      className="px-3 py-1.5 bg-white hover:bg-[#F1F5F9] text-[#0F172A] border border-[#CBD5E1] font-bold text-xs rounded-lg cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Images className="w-3.5 h-3.5 text-[#4F46E5]" /> Choose from Gallery
                    </button>
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-1.5">
                    {uploadingImg ? 'Compressing & uploading...' : 'Auto-compressed & stored on Google Drive & local cache'}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || uploadingImg}
              className="w-full h-14 bg-[#10B981] hover:bg-[#059669] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all text-base cursor-pointer mt-4"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Saving Stock...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" /> Save Stock
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Table */}
      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col overflow-hidden">
        <div className="flex justify-between items-center pb-4 border-b border-[#E2E8F0]">
          <div>
            <h3 className="text-base font-bold text-[#0F172A]">Stock Added History</h3>
            <p className="text-xs text-[#64748B]">List of stock items added during this shift</p>
          </div>
          <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] rounded-full text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Saved Records
          </span>
        </div>

        <div className="flex-1 overflow-y-auto mt-4">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-2">
              No stock logs recorded yet. Inward new stock on the left form.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-bold border-b border-[#E2E8F0]">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Barcode</th>
                  <th className="py-3 px-4">Quantity</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F1F5F9] transition-colors">
                    <td className="py-3 px-4 font-bold text-[#4F46E5] tabular-nums">{log.id}</td>
                    <td className="py-3 px-4 font-semibold text-[#0F172A] tabular-nums">{log.product_id}</td>
                    <td className="py-3 px-4 font-extrabold text-[#10B981] tabular-nums text-sm">+{log.change_qty}</td>
                    <td className="py-3 px-4 text-[#64748B]">{log.reason}</td>
                    <td className="py-3 px-4 text-[#64748B] tabular-nums">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#10B981]/10 text-[#10B981] font-bold rounded-md text-[10px]">
                        <ShieldCheck className="w-3 h-3" /> Saved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Google Drive Image Gallery Modal */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#E2E8F0] rounded-3xl max-w-3xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[88vh]">
            {/* Gallery Header */}
            <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#4F46E5]/10 rounded-xl flex items-center justify-center text-[#4F46E5]">
                  <Images className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">Google Drive Image Gallery</h3>
                  <p className="text-xs text-[#64748B]">Select any previously uploaded image for this product</p>
                </div>
              </div>
              <button
                onClick={() => setShowGalleryModal(false)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Gallery Search & Controls */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search images..."
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <button
                onClick={handleOpenGallery}
                disabled={loadingGallery}
                className="px-3 py-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-[#CBD5E1] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Refresh Gallery from Google Drive"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingGallery ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {/* Gallery Grid (Images Only) */}
            <div className="flex-1 overflow-y-auto min-h-[260px] max-h-[440px] p-1">
              {loadingGallery ? (
                <div className="flex flex-col items-center justify-center h-60 gap-2 text-xs text-[#64748B]">
                  <RefreshCw className="w-6 h-6 text-[#4F46E5] animate-spin" />
                  <span>Loading images from Google Drive...</span>
                </div>
              ) : filteredGalleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 gap-2 text-xs text-[#64748B] bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0]">
                  <Images className="w-8 h-8 text-[#CBD5E1]" />
                  <span className="font-bold text-[#0F172A]">No images found in your gallery.</span>
                  <p className="text-[11px] text-[#94A3B8]">Upload an image from your device to add it to your library.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredGalleryImages.map((img) => {
                    const isSelected = imagePreview === img.url;
                    return (
                      <div
                        key={img.id + img.url}
                        onClick={() => {
                          setImagePreview(img.url);
                          setShowGalleryModal(false);
                        }}
                        className={`group relative bg-white border rounded-2xl p-2.5 flex flex-col items-center gap-2 cursor-pointer transition-all hover:shadow-md hover:border-[#4F46E5] ${
                          isSelected ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/20 bg-indigo-50/10 shadow-xs' : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <div className="w-full h-28 rounded-xl overflow-hidden bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center relative p-1">
                          <SmartImage
                            productKey={img.id}
                            src={img.url}
                            alt={img.name}
                            className="w-full h-full object-contain transition-transform group-hover:scale-105"
                          />
                          
                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGalleryImage(img.id, img.name);
                            }}
                            className="absolute top-1.5 left-1.5 p-1.5 bg-white/95 hover:bg-[#FFF1F2] text-[#64748B] hover:text-[#F43F5E] rounded-lg border border-[#CBD5E1] hover:border-[#FECDD3] shadow-xs cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity z-10"
                            title="Delete image from Drive & library"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 bg-[#4F46E5] text-white p-1 rounded-full shadow-xs z-10">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="w-full text-center">
                          <div className="text-xs font-bold text-[#0F172A] truncate w-full group-hover:text-[#4F46E5]">
                            {img.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Gallery Footer */}
            <div className="pt-2 border-t border-[#E2E8F0] flex justify-between items-center text-xs text-[#64748B]">
              <span>Showing {filteredGalleryImages.length} available images</span>
              <button
                type="button"
                onClick={() => setShowGalleryModal(false)}
                className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
