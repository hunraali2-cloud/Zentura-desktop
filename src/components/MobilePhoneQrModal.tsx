import React, { useEffect, useState } from 'react';
import { Smartphone, X, CheckCircle2, QrCode, ExternalLink } from 'lucide-react';
import { supabase } from '@zentura/database';

interface MobilePhoneQrModalProps {
  isOpen: boolean;
  onScanReceived: (barcode: string) => void;
  onClose: () => void;
}

export const MobilePhoneQrModal: React.FC<MobilePhoneQrModalProps> = ({
  isOpen,
  onScanReceived,
  onClose
}) => {
  const [lastScanned, setLastScanned] = useState('');

  // Mobile Web Scanner URL
  const mobileScannerUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/?mode=mobile-scanner`
    : 'https://zentura-pos.vercel.app/?mode=mobile-scanner';

  useEffect(() => {
    if (!isOpen) return;

    let lastProcessedTimestamp = 0;

    // 1. Supabase Realtime Channel for Cross-Device / Mobile Cellular Network Sync
    let realtimeChannel: any = null;
    try {
      realtimeChannel = supabase.channel('zentura_mobile_scans');
      realtimeChannel.on('broadcast', { event: 'scan' }, (payload: any) => {
        if (payload && payload.payload && payload.payload.barcode && payload.payload.timestamp > lastProcessedTimestamp) {
          lastProcessedTimestamp = payload.payload.timestamp;
          handleBarcodeReceived(payload.payload.barcode);
        }
      }).subscribe();
    } catch (e) {
      console.warn('Supabase Realtime error:', e);
    }

    // 2. BroadcastChannel API Listener
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('zentura-barcode-sync');
      channel.onmessage = (event) => {
        if (event.data && event.data.barcode && event.data.timestamp > lastProcessedTimestamp) {
          lastProcessedTimestamp = event.data.timestamp;
          handleBarcodeReceived(event.data.barcode);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }

    // 3. Storage event listener & 300ms fallback polling interval
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'zentura_scanned_barcode' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed.barcode && parsed.timestamp > lastProcessedTimestamp) {
            lastProcessedTimestamp = parsed.timestamp;
            handleBarcodeReceived(parsed.barcode);
          }
        } catch (err) {
          console.warn('Storage parse error:', err);
        }
      }
    };

    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('zentura_scanned_barcode');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.barcode && parsed.timestamp > lastProcessedTimestamp) {
            lastProcessedTimestamp = parsed.timestamp;
            handleBarcodeReceived(parsed.barcode);
          }
        }
      } catch (err) {
        // ignore
      }
    }, 300);

    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      if (channel) channel.close();
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isOpen]);

  const handleBarcodeReceived = (code: string) => {
    setLastScanned(code);
    onScanReceived(code);
    setTimeout(() => {
      setLastScanned('');
    }, 2000);
  };

  const handleOpenMobileViewWindow = () => {
    window.open(mobileScannerUrl, '_blank', 'width=390,height=700');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 text-center">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#4F46E5]">
            <Smartphone className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Mobile Phone Scanner QR</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-[#64748B] font-semibold">
          Scan this QR Code with <strong>ANY Smartphone Camera</strong> to turn your phone into a live barcode scanner!
        </div>

        {/* Real Scannable QR Code Display Box */}
        <div className="bg-[#F8FAFC] border-2 border-dashed border-[#CBD5E1] p-4 rounded-2xl flex flex-col items-center justify-center">
          <div className="w-48 h-48 bg-white border border-[#E2E8F0] rounded-xl flex flex-col items-center justify-center relative p-2 shadow-inner overflow-hidden">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mobileScannerUrl)}`}
              alt="Scan QR Code with Smartphone Camera"
              className="w-40 h-40 object-contain"
            />
            <div className="absolute bottom-1 bg-[#10B981] text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-xs">
              Scan with Smartphone Camera
            </div>
          </div>

          <button
            onClick={handleOpenMobileViewWindow}
            className="text-[11px] text-[#4F46E5] font-mono mt-3 font-bold break-all flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>{mobileScannerUrl}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </button>
        </div>

        {/* Quick Simulated Phone Scan Test Buttons */}
        <div className="space-y-1.5 pt-1 border-t border-[#E2E8F0]">
          <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Test Phone Scan Sync</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleBarcodeReceived('8901234567890')}
              className="py-1.5 px-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-[11px] font-bold text-[#0F172A] cursor-pointer"
            >
              Scan Espresso 500g
            </button>
            <button
              onClick={() => handleBarcodeReceived('8901234567891')}
              className="py-1.5 px-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-[11px] font-bold text-[#0F172A] cursor-pointer"
            >
              Scan Almond Milk 1L
            </button>
          </div>
        </div>

        {lastScanned && (
          <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] font-bold text-xs rounded-xl flex items-center justify-center gap-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4" /> Phone Scanned & Added: {lastScanned}
          </div>
        )}
      </div>
    </div>
  );
};
