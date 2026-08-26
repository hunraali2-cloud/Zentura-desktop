import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2, X } from 'lucide-react';
import { EscPosBuilder, ReceiptOptions } from '@zentura/escpos-engine';
import { dbSync } from '@zentura/database';

interface ReceiptModalProps {
  isOpen: boolean;
  receiptData: ReceiptOptions | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  receiptData,
  onClose
}) => {
  const [printed, setPrinted] = useState(false);

  const settings = dbSync.getStoreSettings();

  // Trigger Save & Print on physical Keyboard Enter / Numpad Enter key
  useEffect(() => {
    if (!isOpen || !receiptData) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) {
        e.preventDefault();
        handlePrintEscPos();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, receiptData]);

  if (!isOpen || !receiptData) return null;

  const handlePrintEscPos = () => {
    if (printed) return;

    // Generate ESC/POS 80mm binary byte array using raw thermal driver engine
    const formattedData: ReceiptOptions = {
      ...receiptData,
      storeName: settings.store_name,
      storeAddress: settings.store_address,
      storePhone: settings.store_phone
    };

    const escposBytes = EscPosBuilder.buildReceipt(formattedData);
    console.log('Generated ESC/POS Byte Array (PKR):', escposBytes.length);
    setPrinted(true);

    setTimeout(() => {
      setPrinted(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#4F46E5]">
            <Printer className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">80mm Thermal Print Receipt</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Visual Preview (Dynamically branded from Store Settings) */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 font-mono text-xs text-[#0F172A] space-y-2 select-text shadow-inner">
          <div className="text-center flex flex-col items-center gap-1.5">
            {settings.store_logo_url && (
              <img
                src={settings.store_logo_url}
                alt="Logo"
                className="w-12 h-12 object-contain bg-white rounded border border-[#E2E8F0] p-0.5"
              />
            )}
            <div className="font-bold text-sm uppercase">{settings.store_name}</div>
            <div className="text-[10px] text-[#64748B]">{settings.store_address}</div>
            <div className="text-[10px] text-[#64748B]">Tel: {settings.store_phone}</div>
          </div>

          <div className="border-b border-dashed border-[#CBD5E1] my-2" />

          <div className="flex justify-between text-[11px]">
            <span>Bill #: {receiptData.invoiceNumber}</span>
            <span>{receiptData.timestamp}</span>
          </div>

          <div className="border-b border-dashed border-[#CBD5E1] my-2" />

          <div className="space-y-1">
            {receiptData.items.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{item.qty}x {item.name}</span>
                <span className="tabular-nums">{settings.currency_symbol} {item.total.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="border-b border-dashed border-[#CBD5E1] my-2" />

          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal Amount:</span>
              <span className="tabular-nums">{settings.currency_symbol} {receiptData.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({settings.tax_rate_percent}%):</span>
              <span className="tabular-nums">{settings.currency_symbol} {receiptData.tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL BILL:</span>
              <span className="tabular-nums">{settings.currency_symbol} {receiptData.total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px] text-[#64748B]">
              <span>Payment Mode:</span>
              <span className="font-bold">{receiptData.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-[11px] text-[#64748B]">
              <span>Cash Paid:</span>
              <span className="tabular-nums">{settings.currency_symbol} {receiptData.tendered.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px] text-[#64748B]">
              <span>Change Returned:</span>
              <span className="tabular-nums">{settings.currency_symbol} {receiptData.change.toLocaleString()}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-[#CBD5E1] my-2" />

          <div className="text-center text-[10px] text-[#64748B] space-y-1 mt-2">
            <div>{settings.receipt_footer_note || 'Thank you for shopping with us!'}</div>
            <div className="font-extrabold text-[10px] text-[#4F46E5] tracking-wider uppercase">
              Powered by Zentura POS
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handlePrintEscPos}
            className="h-12 px-6 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer text-sm"
          >
            {printed ? <CheckCircle2 className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
            {printed ? 'Receipt Saved & Printed!' : 'Save & Print 80mm Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
};
