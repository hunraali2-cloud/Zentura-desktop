import React, { useState, useEffect } from 'react';
import { QrCode, CheckCircle2, X, Smartphone, ShieldCheck, Landmark, Wallet } from 'lucide-react';
import { dbSync, StoreSettings } from '@zentura/database';

interface OnlineQrModalProps {
  isOpen: boolean;
  totalAmount: number;
  onPaymentConfirmed: () => void;
  onClose: () => void;
}

export const OnlineQrModal: React.FC<OnlineQrModalProps> = ({
  isOpen,
  totalAmount,
  onPaymentConfirmed,
  onClose
}) => {
  const [selectedWallet, setSelectedWallet] = useState<'easypaisa' | 'bank' | 'qr'>('easypaisa');
  const [confirming, setConfirming] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(dbSync.getStoreSettings());

  useEffect(() => {
    if (!isOpen) return;
    const loadSettings = () => {
      setStoreSettings(dbSync.getStoreSettings());
    };
    loadSettings();
    dbSync.fetchStoreSettings().then(setStoreSettings);
    const unsubscribe = dbSync.subscribe(loadSettings);
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      onPaymentConfirmed();
    }, 1000);
  };

  const currencySymbol = storeSettings.currency_symbol || 'Rs.';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 text-center">
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#4F46E5]">
            <QrCode className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Digital Payment & QR</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Digital Wallet Switcher */}
        <div className="flex gap-2 p-1 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
          <button
            onClick={() => setSelectedWallet('easypaisa')}
            className={`flex-1 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer ${
              selectedWallet === 'easypaisa'
                ? 'bg-[#10B981] text-white shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            EasyPaisa
          </button>
          <button
            onClick={() => setSelectedWallet('bank')}
            className={`flex-1 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer ${
              selectedWallet === 'bank'
                ? 'bg-[#4F46E5] text-white shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Bank Transfer
          </button>
          <button
            onClick={() => setSelectedWallet('qr')}
            className={`flex-1 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer ${
              selectedWallet === 'qr'
                ? 'bg-[#F59E0B] text-white shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Scan QR
          </button>
        </div>

        {/* Total Bill Display */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
          <div className="text-xs text-[#64748B] font-semibold">Total Amount Due</div>
          <div className="text-2xl font-extrabold text-[#4F46E5] tabular-nums mt-0.5">
            {currencySymbol} {totalAmount.toLocaleString()}
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="min-h-[190px] flex flex-col justify-center">
          {selectedWallet === 'easypaisa' && (
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-3 text-left text-xs animate-fade-in">
              <div className="flex items-center gap-2 font-extrabold text-[#0F172A] border-b border-[#E2E8F0] pb-2">
                <Wallet className="w-4 h-4 text-[#10B981]" /> EasyPaisa / JazzCash Mobile Account
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-[#64748B] font-bold">ACCOUNT NUMBER / PHONE</div>
                  <div className="text-sm font-bold text-[#0F172A] font-mono select-all">
                    {storeSettings.easypaisa_number || 'Not Configured'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-bold">ACCOUNT TITLE</div>
                  <div className="text-sm font-bold text-[#0F172A]">
                    {storeSettings.easypaisa_title || 'Not Configured'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedWallet === 'bank' && (
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-3 text-left text-xs animate-fade-in">
              <div className="flex items-center gap-2 font-extrabold text-[#0F172A] border-b border-[#E2E8F0] pb-2">
                <Landmark className="w-4 h-4 text-[#4F46E5]" /> Direct Bank Transfer Details
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-[#64748B] font-bold">BANK NAME</div>
                  <div className="text-sm font-bold text-[#0F172A]">
                    {storeSettings.bank_name || 'Not Configured'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-bold">ACCOUNT NUMBER / IBAN</div>
                  <div className="text-sm font-bold text-[#0F172A] font-mono select-all">
                    {storeSettings.account_number || 'Not Configured'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-bold">ACCOUNT TITLE</div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    {storeSettings.account_title || 'Not Configured'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedWallet === 'qr' && (
            <div className="flex flex-col items-center justify-center p-2 border-2 border-dashed border-[#CBD5E1] rounded-2xl animate-fade-in bg-white">
              <div className="w-40 h-40 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-center relative p-2 shadow-inner">
                {storeSettings.qr_code_url ? (
                  <img
                    src={storeSettings.qr_code_url}
                    alt="Scan QR"
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <span className="text-[10px] text-[#64748B] text-center p-2">QR Code Image Not Uploaded</span>
                )}
              </div>
              <div className="text-[10px] text-[#64748B] mt-2 flex items-center gap-1 font-semibold">
                <Smartphone className="w-3.5 h-3.5 text-[#10B981]" /> Scan Store Payment QR Code
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="h-12 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-sm mt-1"
        >
          {confirming ? (
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 animate-spin" /> Verifying Payment...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Approve Payment & Complete Bill
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
