import React, { useState, useEffect } from 'react';
import { BarcodeListener } from '../components/BarcodeListener';
import { TactileNumpad } from '../components/TactileNumpad';
import { ReceiptModal } from '../components/ReceiptModal';
import { ManagerPinModal } from '../components/ManagerPinModal';
import { OnlineQrModal } from '../components/OnlineQrModal';
import { UdhaarModal } from '../components/UdhaarModal';
import { ReceiptOptions } from '@zentura/escpos-engine';
import { ShoppingCart, ShieldAlert, Search, Tag, CheckCircle2, Barcode, Package } from 'lucide-react';
import { dbSync, Product, User, StoreSettings } from '@zentura/database';

interface CartItem {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  price: number;
  qty: number;
}

interface RegisterViewProps {
  enableUdhaar: boolean;
  cashier?: User | null;
}

export const RegisterView: React.FC<RegisterViewProps> = ({ enableUdhaar, cashier }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [numpadAmount, setNumpadAmount] = useState<string>('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptOptions | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(dbSync.getStoreSettings());

  // Modals state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showManagerPinModal, setShowManagerPinModal] = useState(false);
  const [showOnlineQrModal, setShowOnlineQrModal] = useState(false);
  const [showUdhaarModal, setShowUdhaarModal] = useState(false);

  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<'cash' | 'online' | 'udhaar'>('cash');
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  useEffect(() => {
    const loadData = () => {
      setProducts(dbSync.getProducts());
      setStoreSettings(dbSync.getStoreSettings());
    };
    loadData();
    dbSync.fetchProducts().then(setProducts);
    dbSync.fetchStoreSettings().then(setStoreSettings);
    const unsubscribe = dbSync.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const handleBarcodeScan = (scannedBarcode: string) => {
    const code = scannedBarcode.trim().toLowerCase();
    const currentProducts = dbSync.getProducts();
    const matchedProduct = currentProducts.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code) ||
        (p.sku && p.sku.toLowerCase() === code) ||
        p.id.toLowerCase() === code
    );

    if (matchedProduct) {
      addToCart({
        id: matchedProduct.id,
        sku: matchedProduct.sku,
        barcode: matchedProduct.barcode,
        name: matchedProduct.name,
        price: matchedProduct.retail_price,
        qty: 1
      });
      showToast(`Scanned & Added: ${matchedProduct.name}`);
    } else {
      showToast(`Scanned Barcode: ${scannedBarcode}`);
    }
  };

  const addToCart = (itemData: CartItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === itemData.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === itemData.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { ...itemData, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  };

  // Dynamic Financial Math driven live from Admin Store Settings
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const taxRatePercent = storeSettings.tax_rate_percent ?? 17;
  const tax = subtotal * (taxRatePercent / 100);
  const total = subtotal + tax;
  const currencySymbol = storeSettings.currency_symbol || 'Rs.';

  const handlePaymentInitiate = (method: 'cash' | 'online' | 'udhaar', tenderedAmount: number) => {
    if (cart.length === 0) {
      showToast('Cart is empty. Scan product barcode or search item first.');
      return;
    }

    setPendingPaymentMethod(method);

    if (method === 'online') {
      setShowOnlineQrModal(true);
    } else if (method === 'udhaar') {
      setShowUdhaarModal(true);
    } else {
      finalizeTransaction('CASH TENDER', tenderedAmount, 'Walk-in Customer');
    }
  };

  const finalizeTransaction = (paymentMethodLabel: string, tenderedAmount: number, customerDetail: string) => {
    const change = Math.max(0, tenderedAmount - total);
    const invoiceNum = `BILL-${Math.floor(100000 + Math.random() * 900000)}`;

    const newReceipt: ReceiptOptions = {
      storeName: storeSettings.store_name || 'ZENTURA POS MAIN STORE',
      storeAddress: storeSettings.store_address || 'Main Commercial Plaza, Sector F-7, Islamabad',
      storePhone: storeSettings.store_phone || '+92 (051) 111-936-887',
      invoiceNumber: invoiceNum,
      cashierName: cashier ? `${cashier.name} [${customerDetail}]` : `Alex Rivera (Cashier) [${customerDetail}]`,
      items: cart.map(item => ({
        name: item.name,
        qty: item.qty,
        price: item.price,
        total: item.price * item.qty
      })),
      subtotal,
      tax,
      total,
      tendered: tenderedAmount,
      change,
      paymentMethod: paymentMethodLabel,
      timestamp: new Date().toLocaleString()
    };

    dbSync.createInvoice(
      {
        tenant_id: 't-1',
        cashier_id: cashier ? cashier.name : 'Cashier #01',
        invoice_number: invoiceNum,
        subtotal,
        tax,
        total,
        tendered: tenderedAmount,
        change,
        payment_method: pendingPaymentMethod === 'udhaar' ? 'account' : pendingPaymentMethod,
        status: 'completed'
      },
      cart.map(item => ({
        product_id: item.id,
        qty: item.qty,
        unit_price: item.price,
        name: item.name
      }))
    );

    setReceiptData(newReceipt);
    setShowReceiptModal(true);
    setCart([]);
    setNumpadAmount('0');
    setSearchQuery('');
    showToast(`Bill Saved & Receipt Printed: ${invoiceNum}`);
  };

  // Comprehensive Product Filter matching Name, Barcode, SKU, and ID
  const query = searchQuery.trim().toLowerCase();
  const filteredProducts = query
    ? products.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(query)) ||
          (p.barcode && p.barcode.toLowerCase().includes(query)) ||
          (p.sku && p.sku.toLowerCase().includes(query)) ||
          (p.id && p.id.toLowerCase().includes(query))
      )
    : [];

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden h-[calc(100vh-64px)]">
      {/* USB HID Barcode Listener */}
      <BarcodeListener onScan={handleBarcodeScan} />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
          {toastMessage}
        </div>
      )}

      {/* Left Panel: Search Bar & Barcode Scan Area */}
      <div className="flex-1 flex flex-col gap-4 bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search product name, barcode, or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#4F46E5]"
            />
          </div>

          <button
            onClick={() => {
              if (cart.length > 0) setShowManagerPinModal(true);
            }}
            disabled={cart.length === 0}
            className="h-10 px-3 bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#F43F5E] font-bold rounded-lg text-xs flex items-center gap-1 border border-[#F43F5E]/30 cursor-pointer disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" /> Clear Cart
          </button>
        </div>

        {/* Scan & Search Area */}
        <div className="flex-1 overflow-y-auto pr-1">
          {query ? (
            filteredProducts.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() =>
                      addToCart({
                        id: product.id,
                        sku: product.sku,
                        barcode: product.barcode,
                        name: product.name,
                        price: product.retail_price,
                        qty: 1
                      })
                    }
                    className="bg-[#F8FAFC] hover:bg-[#F1F5F9] active:scale-[0.98] border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col justify-between text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex gap-3 items-start w-full">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-[#E2E8F0]">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold text-[#64748B] flex items-center justify-between">
                          <span className="flex items-center gap-1 font-mono text-[9px] truncate max-w-[65px]">
                            <Tag className="w-2.5 h-2.5 text-[#4F46E5]" /> {product.sku}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${product.stock_qty > 5 ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
                            Stock: {product.stock_qty}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-[#0F172A] mt-1 line-clamp-2 group-hover:text-[#4F46E5] transition-colors leading-tight">
                          {product.name}
                        </div>
                        <div className="text-[9px] text-[#64748B] font-mono mt-0.5 truncate">
                          {product.barcode}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#E2E8F0] w-full">
                      <div className="text-sm font-extrabold text-[#4F46E5] tabular-nums">
                        {currencySymbol} {product.retail_price.toLocaleString()}
                      </div>
                      <span className="text-[9px] font-bold bg-[#4F46E5] text-white px-2 py-1 rounded-lg shadow-2xs">
                        + Add
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-2">
                <Search className="w-8 h-8 opacity-40 text-[#4F46E5]" />
                No live products found matching "{searchQuery}".
              </div>
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-3 text-center border-2 border-dashed border-[#E2E8F0] rounded-2xl p-8 bg-[#F8FAFC]">
              <div className="w-16 h-16 rounded-full bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5]">
                <Barcode className="w-8 h-8" />
              </div>
              <div>
                <div className="font-extrabold text-sm text-[#0F172A]">Scan Barcode or Search Item</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Cart & Tactile Numpad */}
      <div className="w-[490px] flex flex-col gap-4 overflow-hidden">
        {/* Cart Container */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex-1 flex flex-col overflow-hidden shadow-xs">
          <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2 font-bold text-[#0F172A] text-base">
              <ShoppingCart className="w-5 h-5 text-[#4F46E5]" /> Current Bill Cart
            </div>
            <span className="text-xs font-semibold bg-[#4F46E5]/10 text-[#4F46E5] px-2.5 py-1 rounded-full tabular-nums">
              {cart.reduce((a, b) => a + b.qty, 0)} items
            </span>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0] py-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-2">
                <ShoppingCart className="w-8 h-8 opacity-40" />
                Cart is empty. Scan product barcode or search item.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="py-2.5 flex justify-between items-center text-sm">
                  <div className="flex-1 pr-2">
                    <div className="font-semibold text-[#0F172A]">{item.name}</div>
                    <div className="text-xs text-[#64748B] tabular-nums">{currencySymbol} {item.price.toLocaleString()} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-7 h-7 bg-[#F1F5F9] hover:bg-[#E2E8F0] font-bold rounded text-[#0F172A] flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold text-[#0F172A] tabular-nums w-6 text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-7 h-7 bg-[#F1F5F9] hover:bg-[#E2E8F0] font-bold rounded text-[#0F172A] flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                    <span className="font-extrabold text-[#0F172A] tabular-nums w-20 text-right">
                      {currencySymbol} {(item.price * item.qty).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Order Totals Summary */}
          <div className="pt-3 border-t border-[#E2E8F0] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#64748B]">
              <span>Subtotal Amount:</span>
              <span className="tabular-nums font-semibold">{currencySymbol} {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[#64748B]">
              <span>Sales Tax (GST {taxRatePercent}%):</span>
              <span className="tabular-nums font-semibold">{currencySymbol} {tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-[#0F172A] pt-1">
              <span>TOTAL BILL:</span>
              <span className="tabular-nums text-[#4F46E5]">{currencySymbol} {total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Numpad */}
        <TactileNumpad
          amount={numpadAmount}
          totalDue={total}
          enableUdhaar={enableUdhaar}
          onAmountChange={setNumpadAmount}
          onPaymentSubmit={handlePaymentInitiate}
        />
      </div>

      {/* Modals */}
      <ReceiptModal
        isOpen={showReceiptModal}
        receiptData={receiptData}
        onClose={() => setShowReceiptModal(false)}
      />

      <OnlineQrModal
        isOpen={showOnlineQrModal}
        totalAmount={total}
        onPaymentConfirmed={() => {
          setShowOnlineQrModal(false);
          finalizeTransaction('ONLINE QR CODE', total, 'Digital Transfer');
        }}
        onClose={() => setShowOnlineQrModal(false)}
      />

      <UdhaarModal
        isOpen={showUdhaarModal}
        totalAmount={total}
        onUdhaarConfirmed={(customerName, customerPhone) => {
          setShowUdhaarModal(false);
          finalizeTransaction('UDHAAR CREDIT', total, `Udhaar: ${customerName} (${customerPhone})`);
        }}
        onClose={() => setShowUdhaarModal(false)}
      />

      <ManagerPinModal
        isOpen={showManagerPinModal}
        actionTitle="Clear Shift Cart"
        onSuccess={() => {
          setShowManagerPinModal(false);
          setCart([]);
          showToast('Shift cart cleared by Store Manager.');
        }}
        onCancel={() => setShowManagerPinModal(false)}
      />
    </div>
  );
};
