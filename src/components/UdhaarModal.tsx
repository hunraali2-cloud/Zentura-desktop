import React, { useState, useEffect } from 'react';
import { dbSync, Customer } from '@zentura/database';
import { BookOpen, X, CheckCircle2, UserPlus, Search, UserCheck, Phone, ArrowLeft } from 'lucide-react';

interface UdhaarModalProps {
  isOpen: boolean;
  totalAmount: number;
  onUdhaarConfirmed: (customerName: string, customerPhone: string, customerId?: string) => void;
  onClose: () => void;
}

export const UdhaarModal: React.FC<UdhaarModalProps> = ({
  isOpen,
  totalAmount,
  onUdhaarConfirmed,
  onClose
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewCustomerMode, setIsNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settings = dbSync.getStoreSettings();

  useEffect(() => {
    if (isOpen) {
      const load = () => {
        setCustomers(dbSync.getCustomers());
      };
      load();
      dbSync.fetchCustomers().then(setCustomers);
      setSelectedCustomer(null);
      setSearchQuery('');
      setIsNewCustomerMode(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredCustomers = searchQuery.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.phone && c.phone.includes(searchQuery))
      )
    : customers;

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setIsNewCustomerMode(false);
  };

  const handleConfirmUdhaar = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (selectedCustomer) {
      setIsSubmitting(true);
      try {
        onUdhaarConfirmed(
          selectedCustomer.name,
          selectedCustomer.phone || 'N/A',
          selectedCustomer.id
        );
      } finally {
        setTimeout(() => setIsSubmitting(false), 800);
      }
    } else if (isNewCustomerMode || searchQuery.trim()) {
      const name = isNewCustomerMode ? newCustomerName.trim() : searchQuery.trim();
      const phone = isNewCustomerMode ? newCustomerPhone.trim() : '';
      if (!name) return;

      setIsSubmitting(true);
      try {
        const cleanP = phone.replace(/\D/g, '');
        const matched = customers.find(
          (c) =>
            (cleanP.length >= 7 && c.phone && c.phone.replace(/\D/g, '') === cleanP) ||
            c.name.trim().toLowerCase() === name.toLowerCase()
        );

        onUdhaarConfirmed(
          name,
          phone || 'N/A',
          matched ? matched.id : undefined
        );
      } finally {
        setTimeout(() => setIsSubmitting(false), 800);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-[#F59E0B]">
            <BookOpen className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">Customer Udhaar / Credit Sale</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bill Total Info */}
        <div className="bg-[#FFFBEB] border border-[#F59E0B]/30 p-3.5 rounded-xl text-xs text-[#0F172A] flex justify-between items-center">
          <div>
            <div className="text-[#64748B] font-semibold text-[11px]">Invoice Amount Due</div>
            <div className="text-lg font-extrabold text-[#F59E0B] tabular-nums">
              {settings.currency_symbol} {totalAmount.toLocaleString()}
            </div>
          </div>
          <span className="px-2.5 py-1 bg-[#F59E0B]/20 text-[#D97706] rounded-lg font-bold text-[11px]">
            Credit Sale
          </span>
        </div>

        {/* 1. SELECTED CUSTOMER VIEW */}
        {selectedCustomer ? (
          <form onSubmit={handleConfirmUdhaar} className="space-y-4">
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#4F46E5]/10 text-[#4F46E5] flex items-center justify-center font-bold text-sm">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-[#0F172A]">{selectedCustomer.name}</div>
                    <div className="text-xs text-[#64748B]">{selectedCustomer.phone || 'No phone number'}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white rounded-xl border border-[#E2E8F0]">
                  <div className="text-[10px] font-bold text-[#64748B]">Previous Udhaar</div>
                  <div className="font-extrabold text-sm text-[#F43F5E] tabular-nums mt-0.5">
                    {settings.currency_symbol} {selectedCustomer.credit_balance.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-[#E2E8F0]">
                  <div className="text-[10px] font-bold text-[#64748B]">New Total Udhaar</div>
                  <div className="font-extrabold text-sm text-[#F59E0B] tabular-nums mt-0.5">
                    {settings.currency_symbol} {(selectedCustomer.credit_balance + totalAmount).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 bg-[#F59E0B] hover:bg-[#D97706] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer text-sm"
            >
              <CheckCircle2 className={`w-5 h-5 ${isSubmitting ? 'animate-spin' : ''}`} />
              {isSubmitting ? 'Recording Udhaar Bill...' : `Confirm Udhaar (${settings.currency_symbol} ${totalAmount.toLocaleString()})`}
            </button>
          </form>
        ) : isNewCustomerMode ? (
          /* 2. CREATE NEW CUSTOMER VIEW */
          <form onSubmit={handleConfirmUdhaar} className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">New Customer Details</span>
              <button
                type="button"
                onClick={() => setIsNewCustomerMode(false)}
                className="text-xs text-[#4F46E5] font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Search
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Customer Full Name *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Malik Usman"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
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
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newCustomerName.trim()}
              className="w-full h-12 bg-[#F59E0B] hover:bg-[#D97706] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer text-sm mt-2"
            >
              <CheckCircle2 className={`w-5 h-5 ${isSubmitting ? 'animate-spin' : ''}`} />
              {isSubmitting ? 'Saving...' : 'Save & Confirm Udhaar Sale'}
            </button>
          </form>
        ) : (
          /* 3. SEARCH & INSTANT CUSTOMER LIST VIEW */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                Search Customer by Name or Phone
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewCustomerName(searchQuery);
                  setIsNewCustomerMode(true);
                }}
                className="text-xs text-[#4F46E5] font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" /> + New Customer
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
              <input
                type="text"
                autoFocus
                placeholder="Search customer by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            {/* Customer List */}
            <div className="max-h-56 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl bg-[#F8FAFC]">
              {filteredCustomers.length === 0 ? (
                <div className="p-4 text-center space-y-2">
                  <div className="text-xs text-[#64748B]">No matching customers found.</div>
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewCustomerName(searchQuery.trim());
                        setIsNewCustomerMode(true);
                      }}
                      className="px-3 py-1.5 bg-[#4F46E5] text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              ) : (
                filteredCustomers.map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => handleSelectCustomer(cust)}
                    className="w-full p-3 text-left hover:bg-[#F1F5F9] transition-colors flex items-center justify-between cursor-pointer group"
                  >
                    <div>
                      <div className="font-bold text-xs text-[#0F172A] flex items-center gap-1.5 group-hover:text-[#4F46E5] transition-colors">
                        <UserCheck className="w-3.5 h-3.5 text-[#4F46E5]" /> {cust.name}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">{cust.phone || 'No Phone Number'}</div>
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
        )}
      </div>
    </div>
  );
};
