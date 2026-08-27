import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudCheck, CloudAlert } from 'lucide-react';
import { dbSync } from '@zentura/database';

export const NetworkStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const checkStatus = () => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    if (typeof dbSync !== 'undefined' && dbSync.getOfflineQueueLength) {
      setPendingCount(dbSync.getOfflineQueueLength());
    }
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await dbSync.syncNow();
      setPendingCount(res.queueCount);
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        checkStatus();
      }, 1000);
    }
  };

  useEffect(() => {
    checkStatus();

    const handleOnline = async () => {
      setIsOnline(true);
      await handleManualSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsSyncing(false);
      checkStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = dbSync.subscribe(() => {
      checkStatus();
    });

    const interval = setInterval(checkStatus, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (isSyncing) {
    return (
      <button
        onClick={handleManualSync}
        className="flex items-center gap-1.5 px-3 py-1 bg-[#4F46E5]/10 border border-[#4F46E5]/30 text-[#4F46E5] rounded-full text-xs font-bold animate-pulse shadow-xs cursor-pointer"
        title="Syncing offline queue with Supabase Cloud..."
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#4F46E5]" />
        <span>Syncing Cloud...</span>
      </button>
    );
  }

  if (isOnline) {
    return (
      <button
        onClick={handleManualSync}
        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer"
        title="Connected to Supabase Cloud (Click to refresh sync)"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
        <span>ONLINE</span>
        {pendingCount > 0 && (
          <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] rounded-full font-extrabold animate-bounce">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleManualSync}
      className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer"
      title="Offline Local Mode — Changes cached locally and will auto-sync on reconnect"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
      <span>OFFLINE {pendingCount > 0 ? `(${pendingCount} pending)` : '(Local)'}</span>
    </button>
  );
};
