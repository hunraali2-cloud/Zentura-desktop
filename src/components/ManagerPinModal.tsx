import React, { useState, useEffect } from 'react';
import { ShieldAlert, KeyRound, X } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  actionTitle: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  actionTitle,
  onSuccess,
  onCancel
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        verifyPinDirect(next);
      }
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const verifyPinDirect = (pinVal: string) => {
    if (pinVal === '9999' || pinVal === '1234') {
      onSuccess();
      setPin('');
      setError('');
    } else {
      setError('Invalid Manager PIN. Access Denied.');
      setPin('');
    }
  };

  const handleSubmit = () => {
    verifyPinDirect(pin);
  };

  // Exclusive physical numpad interceptor
  useEffect(() => {
    if (!isOpen) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Digits
      if ((e.key >= '0' && e.key <= '9') || (e.code >= 'Numpad0' && e.code <= 'Numpad9')) {
        const char = e.key >= '0' && e.key <= '9' ? e.key : e.code.replace('Numpad', '');
        if (char >= '0' && char <= '9') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleDigit(char);
        }
      }
      // 2. Clear / Delete / Backspace / Escape
      else if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.code === 'NumpadDecimal' ||
        e.key.toLowerCase() === 'c'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleClear();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
      // 3. Enter
      else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (pin.length > 0) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, pin]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#F43F5E]">
            <ShieldAlert className="w-6 h-6" />
            <h3 className="text-base font-bold text-[#0F172A]">Manager Authorization</h3>
          </div>
          <button onClick={onCancel} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-[#64748B] bg-[#FFF1F2] border border-[#F43F5E]/30 p-3 rounded-lg flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#F43F5E] shrink-0" />
          <span>Enter authorized Manager PIN to proceed with: <strong>{actionTitle}</strong></span>
        </div>

        {/* PIN Input Display */}
        <div className="flex justify-center gap-3 my-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${
                pin.length > index
                  ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5]'
                  : 'border-[#E2E8F0] bg-[#F8FAFC]'
              }`}
            >
              {pin.length > index ? '•' : ''}
            </div>
          ))}
        </div>

        {error && <div className="text-xs font-bold text-[#F43F5E] text-center">{error}</div>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map((key) => (
            <button
              key={key}
              onClick={() => {
                if (key === 'C') handleClear();
                else if (key === '✓') handleSubmit();
                else handleDigit(key);
              }}
              className={`h-12 min-h-[48px] font-bold rounded-lg border transition-colors ${
                key === '✓'
                  ? 'bg-[#10B981] text-white border-[#10B981] hover:bg-[#059669]'
                  : key === 'C'
                  ? 'bg-[#F1F5F9] text-[#F43F5E] border-[#E2E8F0] hover:bg-[#E2E8F0]'
                  : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-[#F8FAFC]'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
