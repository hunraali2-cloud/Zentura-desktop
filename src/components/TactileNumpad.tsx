import React, { useEffect } from 'react';
import { Banknote, QrCode, BookOpen, ArrowRightLeft } from 'lucide-react';

interface TactileNumpadProps {
  amount: string;
  totalDue: number;
  enableUdhaar: boolean;
  isProcessing?: boolean;
  onAmountChange: (value: string | ((prev: string) => string)) => void;
  onPaymentSubmit: (method: 'cash' | 'online' | 'udhaar', tenderedAmount: number) => void;
}

export const TactileNumpad: React.FC<TactileNumpadProps> = ({
  amount,
  totalDue,
  enableUdhaar,
  isProcessing = false,
  onAmountChange,
  onPaymentSubmit
}) => {
  const currentTendered = parseFloat(amount) || 0;
  const change = Math.max(0, currentTendered - totalDue);

  const handleDigit = (digit: string) => {
    onAmountChange((prev) => {
      const current = prev || '0';
      if (digit === '.' && current.includes('.')) return current;
      if (current === '0' && digit !== '.') return digit;
      return current + digit;
    });
  };

  const handleBackspace = () => {
    onAmountChange((prev) => {
      const current = prev || '0';
      if (current.length <= 1) return '0';
      return current.slice(0, -1);
    });
  };

  const handleClear = () => {
    onAmountChange('0');
  };

  // Physical Numpad & Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore typing if active element is a text input field, textarea, or if popup modal is open
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (document.querySelector('.fixed.z-50')) {
        return;
      }

      // 1. Physical Numpad Key next to 0 (. / Delete) + Backspace + Delete keys
      if (
        e.code === 'NumpadDecimal' ||
        e.key === 'NumpadDecimal' ||
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.key === 'Del' ||
        e.code === 'Delete' ||
        e.code === 'Backspace' ||
        e.keyCode === 8 ||
        e.keyCode === 46 ||
        e.keyCode === 110
      ) {
        e.preventDefault();
        handleBackspace();
        return;
      }

      // 2. CLEAR / ESCAPE
      if (e.key === 'Escape' || e.key === 'Clear' || e.code === 'Clear') {
        e.preventDefault();
        handleClear();
        return;
      }

      // 3. ENTER / SUBMIT CASH
      if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) {
        e.preventDefault();
        if (isProcessing) return;
        onPaymentSubmit('cash', currentTendered || totalDue);
        return;
      }

      // 4. DECIMAL POINT (. or ,) from main keyboard row if needed
      if (
        e.key === '.' ||
        e.key === ',' ||
        e.code === 'Period' ||
        e.keyCode === 190 ||
        e.keyCode === 188
      ) {
        e.preventDefault();
        handleDigit('.');
        return;
      }

      // 5. DIGITS 0-9 (Main row or Numpad)
      if ((e.key >= '0' && e.key <= '9') || (e.code >= 'Numpad0' && e.code <= 'Numpad9')) {
        const char = e.key >= '0' && e.key <= '9' ? e.key : e.code.replace('Numpad', '');
        if (char >= '0' && char <= '9') {
          e.preventDefault();
          handleDigit(char);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTendered, totalDue, isProcessing]);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col gap-3 shadow-xs">
      {/* Display Screen */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs text-[#64748B] font-semibold">
          <span>Cash Paid by Customer</span>
        </div>

        <div className="text-3xl font-extrabold text-[#0F172A] tabular-nums text-right">
          Rs. {currentTendered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        {/* Prominently Highlighted Change to Return Banner */}
        <div className="bg-[#10B981] text-white p-3.5 rounded-xl flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <ArrowRightLeft className="w-4 h-4" /> Change to Return
          </div>
          <div className="text-2xl font-black tabular-nums tracking-tight">
            Rs. {change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Quick Tender Presets (PKR Denominations) */}
      <div className="grid grid-cols-5 gap-2">
        {[100, 500, 1000, 5000].map((preset) => (
          <button
            key={preset}
            onClick={() => onAmountChange(preset.toString())}
            className="h-11 min-h-[44px] bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] text-[#0F172A] font-bold rounded-lg text-xs transition-colors tabular-nums border border-[#E2E8F0] cursor-pointer"
          >
            Rs. {preset}
          </button>
        ))}
        <button
          onClick={() => onAmountChange(totalDue.toFixed(2))}
          className="h-11 min-h-[44px] bg-[#4F46E5]/10 hover:bg-[#4F46E5]/20 text-[#4F46E5] font-extrabold rounded-lg text-xs transition-colors border border-[#4F46E5]/30 cursor-pointer"
        >
          Exact Bill
        </button>
      </div>

      {/* Tactile Numpad Grid (Minimum 48px Touch Targets) */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((num) => (
          <button
            key={num}
            onClick={() => handleDigit(num)}
            className="h-13 min-h-[48px] bg-[#FFFFFF] hover:bg-[#F8FAFC] active:bg-[#F1F5F9] text-[#0F172A] text-xl font-bold rounded-lg border border-[#E2E8F0] transition-colors tabular-nums shadow-2xs cursor-pointer"
          >
            {num}
          </button>
        ))}
        <button
          onClick={handleBackspace}
          className="h-13 min-h-[48px] bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] text-[#F43F5E] font-bold rounded-lg border border-[#E2E8F0] text-sm transition-colors cursor-pointer"
        >
          ⌫ DEL
        </button>
      </div>

      {/* Payment Action Selector */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0]">
        <button
          onClick={() => onPaymentSubmit('cash', currentTendered || totalDue)}
          disabled={isProcessing || totalDue <= 0}
          className="h-14 min-h-[48px] bg-[#10B981] hover:bg-[#059669] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all text-sm cursor-pointer"
        >
          <Banknote className="w-5 h-5" /> Cash Paid
        </button>

        <button
          onClick={() => onPaymentSubmit('online', totalDue)}
          disabled={isProcessing || totalDue <= 0}
          className="h-14 min-h-[48px] bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all text-sm cursor-pointer"
        >
          <QrCode className="w-5 h-5" /> Online (QR)
        </button>

        {enableUdhaar ? (
          <button
            onClick={() => onPaymentSubmit('udhaar', totalDue)}
            disabled={isProcessing || totalDue <= 0}
            className="h-14 min-h-[48px] bg-[#F59E0B] hover:bg-[#D97706] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all text-sm cursor-pointer"
          >
            <BookOpen className="w-5 h-5" /> Udhaar
          </button>
        ) : (
          <div className="h-14 min-h-[48px] bg-[#F1F5F9] text-[#64748B] font-bold rounded-lg flex items-center justify-center text-xs border border-[#E2E8F0] text-center px-1">
            Udhaar Off
          </div>
        )}
      </div>
    </div>
  );
};
