import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Camera, RefreshCw, CheckCircle2, QrCode } from 'lucide-react';
import { supabase } from '@zentura/database';

export const MobilePhoneScannerView: React.FC = () => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannedMessage, setScannedMessage] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        stopCamera();
      }
      const constraints = {
        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startAutoBarcodeDetector();
      }
    } catch (err) {
      console.warn('Camera access not granted or unavailable:', err);
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Modern Native HTML5 BarcodeDetector Auto-Scan Loop
  const startAutoBarcodeDetector = () => {
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        });

        const detectFrame = async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const detectedCode = barcodes[0].rawValue;
                broadcastBarcode(detectedCode);
              }
            } catch (e) {
              // Frame scan skip
            }
          }
          animFrameRef.current = requestAnimationFrame(detectFrame);
        };
        detectFrame();
      } catch (e) {
        console.warn('BarcodeDetector init error:', e);
      }
    }
  };

  const broadcastBarcode = (code: string) => {
    if (!code) return;

    // 1. Supabase Realtime Broadcast (Cross-device & cellular network sync)
    try {
      const realtimeChannel = supabase.channel('zentura_mobile_scans');
      realtimeChannel.send({
        type: 'broadcast',
        event: 'scan',
        payload: { barcode: code, timestamp: Date.now() }
      });
    } catch (e) {
      console.warn('Supabase Realtime error:', e);
    }

    // 2. BroadcastChannel API
    try {
      const channel = new BroadcastChannel('zentura-barcode-sync');
      channel.postMessage({ barcode: code, timestamp: Date.now() });
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }

    // 3. localStorage Event Sync
    try {
      localStorage.setItem('zentura_scanned_barcode', JSON.stringify({ barcode: code, timestamp: Date.now() }));
    } catch (e) {
      console.warn('localStorage error:', e);
    }

    setScannedMessage(`Transmitted to POS: ${code}`);
    setTimeout(() => setScannedMessage(''), 2500);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    broadcastBarcode(manualBarcode.trim());
    setManualBarcode('');
  };

  return (
    <div className="min-h-screen w-full bg-[#0F172A] text-white flex flex-col p-4">
      {/* Mobile Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#10B981]" />
          <span className="font-bold text-sm">Zentura Mobile Barcode Scanner</span>
        </div>
        <span className="text-[10px] bg-[#10B981]/20 text-[#10B981] font-bold px-2 py-0.5 rounded-full border border-[#10B981]/30 animate-pulse">
          Sync Live
        </span>
      </header>

      {/* Live Phone Camera Viewport */}
      <div className="relative flex-1 bg-black rounded-2xl overflow-hidden my-4 flex items-center justify-center border border-slate-800 shadow-2xl">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scan Frame Target Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
          <div className="w-full max-w-xs h-36 border-2 border-[#10B981] rounded-2xl bg-[#10B981]/10 flex items-center justify-center relative shadow-2xl">
            <div className="w-full h-0.5 bg-[#10B981] shadow-lg shadow-emerald-400 animate-pulse" />
          </div>
        </div>

        <button
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-xl text-xs font-bold backdrop-blur-xs flex items-center gap-1.5 cursor-pointer border border-white/10"
        >
          <RefreshCw className="w-4 h-4" /> Flip Camera
        </button>
      </div>

      {scannedMessage && (
        <div className="mb-3 p-3 bg-[#10B981] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg animate-bounce">
          <CheckCircle2 className="w-4 h-4" /> {scannedMessage}
        </div>
      )}

      {/* Fast Barcode Test Buttons */}
      <div className="space-y-2 mb-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tap Product to Scan Live</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => broadcastBarcode('8901234567890')}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-white flex justify-between items-center cursor-pointer"
          >
            <span>Espresso 500g</span>
            <span className="text-[10px] text-slate-400 font-mono">8901234567890</span>
          </button>

          <button
            onClick={() => broadcastBarcode('8901234567891')}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-white flex justify-between items-center cursor-pointer"
          >
            <span>Almond Milk 1L</span>
            <span className="text-[10px] text-slate-400 font-mono">8901234567891</span>
          </button>
        </div>
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleManualSubmit} className="flex gap-2 pt-2 border-t border-slate-800">
        <div className="relative flex-1">
          <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Type barcode number..."
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981] tabular-nums"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs rounded-xl cursor-pointer shadow-md"
        >
          Send
        </button>
      </form>
    </div>
  );
};
