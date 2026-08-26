import React, { useState } from 'react';
import { UserCheck, BookOpen, X, CheckCircle2 } from 'lucide-react';

interface UdhaarModalProps {
  isOpen: boolean;
  totalAmount: number;
  onUdhaarConfirmed: (customerName: string, customerPhone: string) => void;
  onClose: () => void;
}

export const UdhaarModal: React.FC<UdhaarModalProps> = ({
  isOpen,
  totalAmount,
  onUdhaarConfirmed,
  onClose
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;
    onUdhaarConfirmed(customerName.trim(), customerPhone.trim() || 'N/A');
    setCustomerName('');
    setCustomerPhone('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#F59E0B]">
            <BookOpen className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Customer Udhaar / Credit Entry</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#FFFBEB] border border-[#F59E0B]/30 p-3 rounded-xl text-xs text-[#0F172A]">
          Record bill total of <strong className="tabular-nums text-[#F59E0B]">Rs. {totalAmount.toLocaleString()}</strong> into Customer Udhaar Khata ledger.
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
              Customer Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Malik Usman"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
              Mobile Phone Number
            </label>
            <input
              type="text"
              placeholder="0300-1234567"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums"
            />
          </div>

          <button
            type="submit"
            className="w-full h-12 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-sm mt-2"
          >
            <CheckCircle2 className="w-5 h-5" /> Record in Customer Udhaar Ledger
          </button>
        </form>
      </div>
    </div>
  );
};
