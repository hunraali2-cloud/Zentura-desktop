import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, CheckCircle2, QrCode } from 'lucide-react';

interface MobileScannerModalProps {
  isOpen: boolean;
  onScanComplete: (barcode: string) => void;
  onClose: () => void;
}

export const MobileScannerModal: React.FC<MobileScannerModalProps> = ({
  isOpen,
  onScanComplete,
  onClose
}) => {
  const [manualBarcode, setManualBarcode] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannedMessage, setScannedMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        stopCamera();
      }
      const constraints = {
        video: { facingMode: facingMode }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera access not granted or unavailable:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleSimulatedCamScan = (sampleBarcode: string) => {
    setScannedMessage(`Scanned Barcode: ${sampleBarcode}`);
    onScanComplete(sampleBarcode);
    setTimeout(() => {
      setScannedMessage('');
      onClose();
    }, 1000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    onScanComplete(manualBarcode.trim());
    setManualBarcode('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#4F46E5]">
            <Camera className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Mobile / Camera Barcode Scanner</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Camera Viewport */}
        <div className="relative bg-[#0F172A] rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-[#CBD5E1]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Scanner Crosshair / Framing Box */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-28 border-2 border-[#10B981] rounded-lg bg-[#10B981]/10 flex flex-col items-center justify-center animate-pulse">
              <div className="w-full h-0.5 bg-[#10B981] shadow-md shadow-emerald-400" />
            </div>
          </div>

          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs font-semibold backdrop-blur-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Flip Cam
            </button>
          </div>
        </div>

        {scannedMessage && (
          <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/30 rounded-xl text-xs font-bold text-[#10B981] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {scannedMessage}
          </div>
        )}

        {/* Fast Sample Barcode Taps for Quick Mobile Scanning Demo */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Quick Camera Test Scan</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSimulatedCamScan('8901234567890')}
              className="py-2 px-3 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#0F172A] flex items-center justify-between cursor-pointer"
            >
              <span>Espresso 500g</span>
              <span className="text-[10px] text-[#64748B] tabular-nums">8901234567890</span>
            </button>
            <button
              onClick={() => handleSimulatedCamScan('8901234567891')}
              className="py-2 px-3 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#0F172A] flex items-center justify-between cursor-pointer"
            >
              <span>Almond Milk 1L</span>
              <span className="text-[10px] text-[#64748B] tabular-nums">8901234567891</span>
            </button>
          </div>
        </div>

        {/* Manual Barcode Input Fallback */}
        <form onSubmit={handleManualSubmit} className="pt-2 border-t border-[#E2E8F0] flex gap-2">
          <div className="relative flex-1">
            <QrCode className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Or type barcode number..."
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs focus:outline-none focus:border-[#4F46E5] tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs rounded-lg cursor-pointer"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};
