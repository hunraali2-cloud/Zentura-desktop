import React, { useState, useEffect } from 'react';
import { dbSync, User, supabase } from '@zentura/database';
import { KeyRound, ShieldAlert, Lock, AlertTriangle, RefreshCw } from 'lucide-react';

interface CashierAuthModalProps {
  isOpen: boolean;
  onSuccess: (cashier: User) => void;
  onClose?: () => void;
  allowClose?: boolean;
}

export const CashierAuthModal: React.FC<CashierAuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  allowClose = false
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLicenseLocked, setIsLicenseLocked] = useState(false);
  const [licenseErrorMsg, setLicenseErrorMsg] = useState('');

  // Check store license status live
  const checkCurrentStoreLicense = async () => {
    const tenantId = dbSync.getTenantId();
    if (!tenantId || tenantId === 't-1') {
      setIsLicenseLocked(false);
      setLicenseErrorMsg('');
      return;
    }

    // If offline, NEVER lock the terminal. Allow full offline cashier operation.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsLicenseLocked(false);
      setLicenseErrorMsg('');
      return;
    }

    try {
      // 1. Check Tenant Status in Supabase
      const { data: tenantData, error: tErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      // Network / Fetch errors must NOT lock the terminal
      if (tErr) {
        if (tErr.code === 'PGRST116') {
          // Explicitly not found in database
          setIsLicenseLocked(true);
          setLicenseErrorMsg('This store account has been deleted or cannot be found in the cloud.');
          return;
        }
        // Network connection error - ignore and allow offline cashiering
        setIsLicenseLocked(false);
        setLicenseErrorMsg('');
        return;
      }

      if (tenantData && tenantData.is_active === false) {
        setIsLicenseLocked(true);
        setLicenseErrorMsg('This store business account has been disabled or suspended by Super Admin.');
        return;
      }

      // 2. Check License Expiry in Supabase
      const { data: licenseData, error: lErr } = await supabase
        .from('licenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('expires_at', { ascending: false })
        .limit(1)
        .single();

      if (!lErr && licenseData) {
        if (!licenseData.is_active) {
          setIsLicenseLocked(true);
          setLicenseErrorMsg('The subscription license for this store has been suspended by Super Admin.');
          return;
        }

        const expiry = new Date(licenseData.expires_at).getTime();
        if (expiry <= Date.now()) {
          const expDate = new Date(licenseData.expires_at).toLocaleDateString();
          setIsLicenseLocked(true);
          setLicenseErrorMsg(`Store subscription expired on ${expDate}. Cashier terminal is locked.`);
          return;
        }
      }

      // Store is active and license is valid! Auto unlock
      setIsLicenseLocked(false);
      setLicenseErrorMsg('');
    } catch (e) {
      // If offline or network error, allow local operation
      setIsLicenseLocked(false);
      setLicenseErrorMsg('');
    }
  };

  // Poll store status when online, and immediately recheck & flush queue when internet returns
  useEffect(() => {
    if (isOpen) {
      dbSync.fetchUsers().catch(() => {});
      checkCurrentStoreLicense();

      const handleOnline = async () => {
        console.log('⚡ Network connection restored in Cashier Auth. Checking cloud status and syncing...');
        await checkCurrentStoreLicense();
        try {
          await dbSync.syncNow();
        } catch (err) {
          console.warn('Sync error on online event:', err);
        }
      };

      const handleOffline = () => {
        // Unlock immediately so cashier is never blocked offline
        setIsLicenseLocked(false);
        setLicenseErrorMsg('');
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      const interval = setInterval(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          checkCurrentStoreLicense();
        }
      }, 10000);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(interval);
      };
    }
  }, [isOpen]);

  const handleNumpadClick = (digit: string) => {
    if (isLicenseLocked) return;
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleClearPin = () => {
    setPin('');
    setError('');
  };

  // Physical Numpad & Keyboard Event Interceptor for PIN Popup
  useEffect(() => {
    if (!isOpen) return;

    // Immediately blur any background inputs so numpad exclusively enters PIN
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (isLicenseLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Digits 0-9 from Main keyboard or Physical Numpad
      if ((e.key >= '0' && e.key <= '9') || (e.code >= 'Numpad0' && e.code <= 'Numpad9')) {
        const char = e.key >= '0' && e.key <= '9' ? e.key : e.code.replace('Numpad', '');
        if (char >= '0' && char <= '9') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleNumpadClick(char);
        }
      } 
      // 2. Clear / Delete / Backspace
      else if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.code === 'NumpadDecimal' ||
        e.key.toLowerCase() === 'c' ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleClearPin();
      } 
      // 3. Enter / Confirm
      else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (pin.length >= 4) {
          verifyPin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, pin, loading, isLicenseLocked]);

  if (!isOpen) return null;

  const verifyPin = async (pinToVerify: string) => {
    setLoading(true);
    const cleanPin = pinToVerify.trim();

    try {
      // 1. Instant local authentication (works 100% offline and online without waiting for network)
      let user = dbSync.authenticateCashierByPin(cleanPin);

      // 2. If online and not found in local sync cache, try fetching from Supabase
      if (!user && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const users = await dbSync.fetchUsers();
          user = users.find((u) => u.pin_code && u.pin_code.trim() === cleanPin) || user;
        } catch (err) {
          console.warn('Network error fetching users:', err);
        }

        // Cross-tenant auto-discovery by PIN in cloud
        if (!user) {
          try {
            const { data, error: sbErr } = await supabase
              .from('users')
              .select('*')
              .eq('pin_code', cleanPin);

            if (!sbErr && data && data.length > 0) {
              const matched = data[0];
              user = {
                id: matched.id,
                tenant_id: matched.tenant_id,
                name: matched.name,
                email: matched.email,
                role: matched.role || 'cashier',
                pin_code: matched.pin_code,
                rfid_tag: matched.rfid_tag,
                created_at: matched.created_at || new Date().toISOString()
              };

              if (matched.tenant_id) {
                dbSync.setTenantId(matched.tenant_id);
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('zentura_active_tenant_id', matched.tenant_id);
                }
                dbSync.syncAllFromSupabase().catch(() => {});
              }
            }
          } catch (e) {
            console.warn('Cross-tenant lookup error:', e);
          }
        }
      }

      // 3. Verify License & Store Status only if online and explicitly returned
      if (user && user.tenant_id && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', user.tenant_id)
            .single();

          if (tenantData && tenantData.is_active === false) {
            setLoading(false);
            setIsLicenseLocked(true);
            setError(`Store "${tenantData.name}" has been disabled or suspended by Super Admin.`);
            setPin('');
            return;
          }

          const { data: licData } = await supabase
            .from('licenses')
            .select('*')
            .eq('tenant_id', user.tenant_id)
            .order('expires_at', { ascending: false })
            .limit(1)
            .single();

          if (licData) {
            if (!licData.is_active) {
              setLoading(false);
              setIsLicenseLocked(true);
              setError('The license for this store has been suspended by Super Admin.');
              setPin('');
              return;
            }

            const expiry = new Date(licData.expires_at).getTime();
            if (expiry <= Date.now()) {
              const expDate = new Date(licData.expires_at).toLocaleDateString();
              setLoading(false);
              setIsLicenseLocked(true);
              setError(`🔒 License expired on ${expDate}. Cashier terminal is locked.`);
              setPin('');
              return;
            }
          }
        } catch (e) {
          // Ignore network errors during PIN verification so cashier is never blocked offline
        }
      }

      setLoading(false);

      if (user) {
        onSuccess(user);
        setPin('');
        setError('');
      } else {
        setError(`Invalid Security PIN (${cleanPin}). Verify your PIN in Store Admin.`);
        setPin('');
      }
    } catch (e: any) {
      setLoading(false);
      // Failover to local credentials
      const localUser = dbSync.authenticateCashierByPin(cleanPin);
      if (localUser) {
        onSuccess(localUser);
        setPin('');
        setError('');
      } else {
        setError(e?.message || 'Error verifying PIN.');
        setPin('');
      }
    }
  };

  const currentStore = dbSync.getStoreSettings();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl max-w-md w-full p-8 shadow-2xl flex flex-col gap-5 my-auto max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-[#4F46E5]/10 rounded-2xl flex items-center justify-center text-[#4F46E5] mx-auto mb-2 shadow-xs">
            {isLicenseLocked ? <Lock className="w-6 h-6 text-[#F43F5E]" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-extrabold text-[#0F172A]">
            {isLicenseLocked ? 'Terminal Locked — Inactive Store' : 'Cashier Terminal Authentication'}
          </h2>
          <p className="text-xs text-[#64748B]">
            Store: <b className="text-[#4F46E5]">{currentStore.store_name || 'Active Store'}</b>
          </p>
        </div>

        {/* Clean Warning Alert Only (No Key Button) */}
        {isLicenseLocked && (
          <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-2xl text-xs text-[#DC2626] font-semibold space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#991B1B]">
              <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
              <span>Subscription Inactive / Expired</span>
            </div>
            <p className="leading-relaxed">
              {licenseErrorMsg || 'This store business account has been disabled or suspended by Super Admin.'}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] text-[#4F46E5] font-bold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Auto-detecting activation. Enter PIN once store is active.</span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-[#FFF1F2] border border-[#F43F5E]/30 rounded-xl text-xs text-[#F43F5E] font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isLicenseLocked && (
          <div className="space-y-4">
            {/* PIN Indicator */}
            <div className="flex justify-center items-center gap-3 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pin.length > idx
                      ? 'bg-[#4F46E5] border-[#4F46E5] scale-110 shadow-xs'
                      : 'border-[#CBD5E1] bg-white'
                  }`}
                />
              ))}
            </div>

            {/* Tactile Numpad */}
            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map((btn) => (
                <button
                  key={btn}
                  disabled={loading}
                  onClick={() => {
                    if (btn === 'C') handleClearPin();
                    else if (btn === '✓') verifyPin(pin);
                    else handleNumpadClick(btn);
                  }}
                  className={`h-14 text-lg font-bold rounded-2xl transition-all cursor-pointer shadow-2xs active:scale-95 flex items-center justify-center ${
                    btn === 'C'
                      ? 'bg-[#FFF1F2] text-[#F43F5E] hover:bg-[#FFE4E6]'
                      : btn === '✓'
                      ? 'bg-[#10B981] text-white hover:bg-[#059669]'
                      : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-[#E2E8F0]'
                  }`}
                >
                  {btn}
                </button>
              ))}
            </div>
          </div>
        )}

        {allowClose && onClose && !isLicenseLocked && (
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer text-center"
          >
            Cancel & Return to Counter
          </button>
        )}
      </div>
    </div>
  );
};
