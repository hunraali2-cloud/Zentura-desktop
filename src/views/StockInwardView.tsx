import React, { useState, useEffect } from 'react';
import { PackagePlus, ShieldCheck, QrCode, Smartphone } from 'lucide-react';
import { dbSync, StockLog, User } from '@zentura/database';
import { MobilePhoneQrModal } from '../components/MobilePhoneQrModal';

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
  const [showMobileScanner, setShowMobileScanner] = useState(false);

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

  const handleConfirmAndLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode || !productName || !quantity) return;

    const qty = parseInt(quantity) || 1;
    const prodBarcode = barcode.trim();

    // 1. Create stock log and update product catalog via dbSync
    dbSync.createStockLog({
      tenant_id: 't-1',
      product_id: prodBarcode,
      cashier_id: cashier ? cashier.name : 'Cashier #01',
      change_qty: qty,
      reason: `Intake: ${supplier || 'Local Supplier'}`,
      locked: true
    });

    // 2. Also ensure product exists / updates in product store
    dbSync.saveProduct({
      barcode: prodBarcode,
      sku: sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: productName,
      retail_price: parseFloat(retailPrice) || 0,
      cost_price: parseFloat(costPrice) || 0,
      stock_qty: qty,
      tenant_id: 't-1'
    });

    setLogs(dbSync.getStockLogs());
    setBarcode('');
    setProductName('');
    setSku('');
    setQuantity('');
    setCostPrice('');
    setRetailPrice('');
    setSupplier('');
    setToast('Stock saved successfully.');
    setTimeout(() => setToast(''), 3500);
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
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                  Product Barcode *
                </label>
                <button
                  type="button"
                  onClick={() => setShowMobileScanner(true)}
                  className="text-[11px] font-bold text-[#4F46E5] flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#10B981]" /> 📱 Mobile Phone Scanner
                </button>
              </div>
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

            <button
              type="submit"
              className="w-full h-14 bg-[#10B981] hover:bg-[#059669] active:scale-[0.99] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all text-base cursor-pointer mt-4"
            >
              <ShieldCheck className="w-5 h-5" /> Save Stock
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

      <MobilePhoneQrModal
        isOpen={showMobileScanner}
        onScanReceived={(scanned) => {
          setBarcode(scanned);
          setShowMobileScanner(false);
        }}
        onClose={() => setShowMobileScanner(false)}
      />
    </div>
  );
};
