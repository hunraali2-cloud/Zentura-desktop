import React, { useState, useEffect } from 'react';
import { dbSync, Customer, User } from '@zentura/database';
import { HandCoins, Search, X, CheckCircle2, UserCheck } from 'lucide-react';

interface UdhaarWasoolModalProps {
  isOpen: boolean;
  cashier?: User | null;
  onClose: () => void;
  onSuccess?: (customerName: string, amountReceived: number) => void;
}

export const UdhaarWasoolModal: React.FC<UdhaarWasoolModalProps> = ({
  isOpen,
  cashier,
  onClose,
  onSuccess
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [wasoolAmount, setWasoolAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settings = dbSync.getStoreSettings();

  useEffect(() => {
    if (isOpen) {
      const load = () => {
        setCustomers(dbSync.getCustomers());
      };
      load();
      dbSync.fetchCustomers().then(setCustomers);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(searchQuery))
  );

  const handleSubmitWasool = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !selectedCustomer) return;

    const amount = parseFloat(wasoolAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsSubmitting(true);
    try {
      dbSync.recordUdhaarTransaction({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone,
        type: 'wasool',
        amount,
        cashier_name: cashier ? cashier.name : 'Cashier Counter',
        notes: notes.trim() || 'Udhaar Payment (Wasool) Received at Cashier Counter'
      });

      if (onSuccess) {
        onSuccess(selectedCustomer.name, amount);
      }

      setToast(`Received ${settings.currency_symbol} ${amount.toLocaleString()} from ${selectedCustomer.name}`);
      setTimeout(() => {
        setToast('');
        onClose();
        setSelectedCustomer(null);
        setWasoolAmount('');
        setNotes('');
        setIsSubmitting(false);
      }, 1500);
    } catch (err) {
      console.warn('Error recording udhaar wasool:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#10B981]">
            <HandCoins className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Receive Udhaar Payment</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {toast && (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] p-3 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {toast}
          </div>
        )}

        {/* Customer Search / Selection */}
        {!selectedCustomer ? (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              Search Customer by Name or Phone
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
              <input
                type="text"
                autoFocus
                placeholder="Type customer name or mobile number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl bg-[#F8FAFC]">
              {filteredCustomers.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#64748B]">No customers found matching search.</div>
              ) : (
                filteredCustomers.map((cust) => (
                  <button
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setWasoolAmount(cust.credit_balance > 0 ? cust.credit_balance.toString() : '');
                    }}
                    className="w-full p-3 text-left hover:bg-[#F1F5F9] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-[#0F172A] flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#4F46E5]" /> {cust.name}
                      </div>
                      <div className="text-[10px] text-[#64748B]">{cust.phone || 'No Phone'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#64748B]">Udhaar Debt</div>
                      <div className={`font-extrabold text-xs tabular-nums ${cust.credit_balance > 0 ? 'text-[#F43F5E]' : 'text-[#10B981]'}`}>
                        {settings.currency_symbol} {cust.credit_balance.toLocaleString()}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Selected Customer Wasool Form */
          <form onSubmit={handleSubmitWasool} className="space-y-4">
            <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex justify-between items-center">
              <div>
                <div className="font-bold text-sm text-[#0F172A]">{selectedCustomer.name}</div>
                <div className="text-xs text-[#64748B]">{selectedCustomer.phone || 'No phone'}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-[#64748B] uppercase">Current Udhaar Debt</div>
                <div className="text-base font-extrabold text-[#F43F5E] tabular-nums">
                  {settings.currency_symbol} {selectedCustomer.credit_balance.toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-[10px] text-[#4F46E5] font-bold underline cursor-pointer mt-0.5"
                >
                  Change Customer
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Payment Amount Received (Wasool) ({settings.currency_symbol}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={wasoolAmount}
                  onChange={(e) => setWasoolAmount(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-base font-extrabold text-[#10B981] focus:outline-none focus:border-[#10B981] tabular-nums"
                />
                <span className="absolute left-3 top-3 text-[#64748B] font-bold text-base">
                  {settings.currency_symbol}
                </span>
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                Remaining debt after this payment:{' '}
                <strong className="text-[#0F172A] font-extrabold tabular-nums">
                  {settings.currency_symbol}{' '}
                  {Math.max(
                    0,
                    selectedCustomer.credit_balance - (parseFloat(wasoolAmount) || 0)
                  ).toLocaleString()}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Notes / Payment Method (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Cash received by cashier"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !wasoolAmount || parseFloat(wasoolAmount) <= 0}
                className="flex-1 h-11 bg-[#10B981] hover:bg-[#059669] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <CheckCircle2 className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                {isSubmitting ? 'Processing Payment...' : 'Receive Udhaar Payment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
