import React, { useState, useEffect } from 'react';
import { RotateCcw, Search, Barcode, ShieldCheck, CheckCircle2, Smartphone } from 'lucide-react';
import { dbSync, Invoice, ReturnRecord, User } from '@zentura/database';
import { MobilePhoneQrModal } from '../components/MobilePhoneQrModal';

interface RefundsViewProps {
  cashier?: User | null;
}

export const RefundsView: React.FC<RefundsViewProps> = ({ cashier }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('Defective / Damaged Item');
  const [showMobileScanner, setShowMobileScanner] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>(dbSync.getInvoices());
  const [recentReturns, setRecentReturns] = useState<ReturnRecord[]>([]);
  const [toast, setToast] = useState('');

  const settings = dbSync.getStoreSettings();

  useEffect(() => {
    const loadLiveData = () => {
      setInvoices(dbSync.getInvoices());
      setRecentReturns(dbSync.getReturns());
    };
    loadLiveData();
    dbSync.fetchInvoices().then(setInvoices);
    dbSync.fetchReturns().then(setRecentReturns);
    const unsubscribe = dbSync.subscribe(loadLiveData);
    return () => unsubscribe();
  }, []);

  const handleSearchOrScan = (code: string) => {
    if (!code.trim()) return;
    const found = invoices.find(
      (inv) => inv.invoice_number.toLowerCase() === code.trim().toLowerCase() || inv.id === code.trim()
    );

    if (found) {
      setSelectedInvoice(found);
      setToast(`Found Bill: ${found.invoice_number}`);
    } else {
      setToast(`No bill matched: ${code}`);
    }
    setTimeout(() => setToast(''), 3000);
  };

  const handleProcessRefund = () => {
    if (!selectedInvoice) return;

    dbSync.processReturn(
      selectedInvoice.invoice_number,
      returnReason,
      selectedInvoice.total,
      cashier ? cashier.name : 'Cashier #01'
    );

    setToast(`Refund of ${settings.currency_symbol} ${selectedInvoice.total.toLocaleString()} processed successfully.`);
    setSelectedInvoice(null);
    setSearchQuery('');
    setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="flex-1 flex gap-6 p-6 overflow-hidden h-[calc(100vh-64px)] animate-fade-in">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-20 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
          {toast}
        </div>
      )}

      {/* Left Column: Invoice / Item Lookup */}
      <div className="w-[450px] bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="p-2.5 bg-[#F43F5E]/10 rounded-xl text-[#F43F5E]">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Product Returns</h2>
              <p className="text-xs text-[#64748B]">Scan bill barcode or search bill below</p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchOrScan(searchQuery);
            }}
            className="space-y-4 mt-5"
          >
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                  Scan Barcode or Bill Number
                </label>
                <button
                  type="button"
                  onClick={() => setShowMobileScanner(true)}
                  className="text-[11px] font-bold text-[#4F46E5] flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#10B981]" /> 📱 Mobile Phone Scanner
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Scan barcode or type bill number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-12 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm cursor-pointer"
            >
              <Search className="w-4 h-4" /> Search Bill
            </button>
          </form>

          {/* Recent Store Invoices to Select */}
          <div className="mt-6 space-y-2">
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Recent Bills</div>
            <div className="space-y-2">
              {invoices.length === 0 ? (
                <div className="text-xs text-[#64748B] p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-center">
                  No completed bills recorded yet.
                </div>
              ) : (
                invoices.slice(0, 5).map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedInvoice(inv)}
                    className="w-full p-3 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl text-left flex justify-between items-center cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="font-bold text-xs text-[#0F172A]">{inv.invoice_number}</div>
                      <div className="text-[10px] text-[#64748B]">{inv.payment_method.toUpperCase()} • {inv.status === 'refunded' ? 'Refunded' : 'Completed'}</div>
                    </div>
                    <div className="font-extrabold text-sm text-[#4F46E5] tabular-nums">
                      {settings.currency_symbol} {inv.total.toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Selected Invoice Details & Refund Processing */}
      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col justify-between overflow-hidden">
        {selectedInvoice ? (
          <div className="flex flex-col h-full justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-xs font-bold text-[#F43F5E] uppercase tracking-wider">Selected Bill</span>
                  <h3 className="text-xl font-extrabold text-[#0F172A] mt-0.5">{selectedInvoice.invoice_number}</h3>
                </div>
                <span
                  className={`px-3 py-1 font-bold rounded-full text-xs uppercase ${
                    selectedInvoice.status === 'refunded'
                      ? 'bg-[#F43F5E]/10 text-[#F43F5E]'
                      : 'bg-[#10B981]/10 text-[#10B981]'
                  }`}
                >
                  {selectedInvoice.status === 'refunded' ? 'Refunded' : 'Completed'}
                </span>
              </div>

              <div className="mt-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Cashier:</span>
                  <span className="font-bold text-[#0F172A]">{selectedInvoice.cashier_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Date & Time:</span>
                  <span className="font-bold text-[#0F172A]">{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Payment Mode:</span>
                  <span className="font-bold text-[#4F46E5] uppercase">{selectedInvoice.payment_method}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-[#0F172A] pt-2 border-t border-[#E2E8F0]">
                  <span>Refund Amount:</span>
                  <span className="tabular-nums text-[#F43F5E]">{settings.currency_symbol} {selectedInvoice.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                  Reason for Return *
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-semibold focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Defective / Damaged Item">Defective / Damaged Item</option>
                  <option value="Customer Mind Change">Customer Mind Change</option>
                  <option value="Wrong Item Purchased">Wrong Item Purchased</option>
                  <option value="Billing Discrepancy">Billing Error</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleProcessRefund}
              disabled={selectedInvoice.status === 'refunded'}
              className="w-full h-14 bg-[#F43F5E] hover:bg-[#E11D48] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors text-base cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-5 h-5" />
              {selectedInvoice.status === 'refunded'
                ? 'Bill Already Refunded'
                : `Process Refund (${settings.currency_symbol} ${selectedInvoice.total.toLocaleString()})`}
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-3 text-center">
            <RotateCcw className="w-12 h-12 opacity-30 text-[#4F46E5]" />
            <div className="font-bold text-sm text-[#0F172A]">No Bill Selected</div>
            <p className="max-w-xs text-center text-[#64748B] text-xs">
              Scan barcode or click a recent bill on the left to start a return.
            </p>
          </div>
        )}
      </div>

      <MobilePhoneQrModal
        isOpen={showMobileScanner}
        onScanReceived={(scanned) => {
          setSearchQuery(scanned);
          handleSearchOrScan(scanned);
          setShowMobileScanner(false);
        }}
        onClose={() => setShowMobileScanner(false)}
      />
    </div>
  );
};
