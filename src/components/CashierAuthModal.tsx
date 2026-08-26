import React, { useState, useEffect } from 'react';
import { dbSync, User, supabase } from '@zentura/database';
import { KeyRound, ShieldAlert } from 'lucide-react';

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

  useEffect(() => {
    if (isOpen) {
      dbSync.fetchUsers().catch(() => {});
    }
  }, [isOpen]);

  const handleNumpadClick = (digit: string) => {
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

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if active element is a text input field or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.key >= '0' && e.key <= '9') || (e.code >= 'Numpad0' && e.code <= 'Numpad9')) {
        const char = e.key >= '0' && e.key <= '9' ? e.key : e.code.replace('Numpad', '');
        if (char >= '0' && char <= '9') {
          e.preventDefault();
          e.stopPropagation();
          handleNumpadClick(char);
        }
      } else if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.code === 'NumpadDecimal' ||
        e.key.toLowerCase() === 'c'
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleClearPin();
      } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        if (pin.length >= 4) {
          verifyPin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, pin, loading]);

  if (!isOpen) return null;

  const verifyPin = async (pinToVerify: string) => {
    setLoading(true);
    const cleanPin = pinToVerify.trim();

    try {
      // 1. Check in currently active tenant
      const users = await dbSync.fetchUsers();
      let user = users.find((u) => u.pin_code && u.pin_code.trim() === cleanPin) || dbSync.authenticateCashierByPin(cleanPin);

      // 2. Cross-tenant auto-discovery: If not found in current local tenant, query Supabase across stores by PIN
      if (!user) {
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

          // Link Cashier Terminal to this store's tenant_id!
          if (matched.tenant_id) {
            dbSync.setTenantId(matched.tenant_id);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('zentura_active_tenant_id', matched.tenant_id);
            }
            await dbSync.syncAllFromSupabase();
          }
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
      setError(e?.message || 'Error verifying PIN.');
      setPin('');
    }
  };

  const currentStore = dbSync.getStoreSettings();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl max-w-md w-full p-8 shadow-2xl flex flex-col gap-5 my-auto max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-[#4F46E5]/10 rounded-2xl flex items-center justify-center text-[#4F46E5] mx-auto mb-2 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-[#0F172A]">Cashier Terminal Authentication</h2>
          <p className="text-xs text-[#64748B]">
            Store: <b className="text-[#4F46E5]">{currentStore.store_name || 'Active Store'}</b>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-[#FFF1F2] border border-[#F43F5E]/30 rounded-xl text-xs text-[#F43F5E] font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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

        {allowClose && onClose && (
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
