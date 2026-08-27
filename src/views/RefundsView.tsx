import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  Calendar,
  CalendarDays,
  DollarSign,
  ShieldCheck,
  Tag,
  UserCheck,
  X,
  Eye,
  RefreshCw,
  History,
  FileText
} from 'lucide-react';
import { dbSync, Invoice, ReturnRecord, User } from '@zentura/database';

interface RefundsViewProps {
  cashier?: User | null;
}

export const RefundsView: React.FC<RefundsViewProps> = ({ cashier }) => {
  const [activeSubTab, setActiveSubTab] = useState<'process' | 'history'>('process');

  // Process Refund State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('Defective / Damaged Item');
  const [invoices, setInvoices] = useState<Invoice[]>(dbSync.getInvoices());
  const [recentReturns, setRecentReturns] = useState<ReturnRecord[]>([]);
  const [toast, setToast] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History & Filter States
  const [historySearch, setHistorySearch] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<
    'all' | 'today' | 'yesterday' | 'week' | 'month' | 'specific_day' | 'specific_month' | 'custom_range'
  >('all');

  const todayStr = new Date().toISOString().split('T')[0];
  const thisMonthStr = todayStr.substring(0, 7);

  const [specificDate, setSpecificDate] = useState(todayStr);
  const [specificMonth, setSpecificMonth] = useState(thisMonthStr);
  const [customStartDate, setCustomStartDate] = useState(todayStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);
  const [reasonFilter, setReasonFilter] = useState('all');
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<ReturnRecord | null>(null);

  const settings = dbSync.getStoreSettings();

  const loadLiveData = () => {
    setInvoices(dbSync.getInvoices());
    setRecentReturns(dbSync.getReturns());
  };

  useEffect(() => {
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
    if (isSubmitting || !selectedInvoice || selectedInvoice.status === 'refunded') return;

    setIsSubmitting(true);
    try {
      dbSync.processReturn(
        selectedInvoice.invoice_number,
        returnReason,
        selectedInvoice.total,
        cashier ? cashier.name : 'Cashier Counter'
      );

      setToast(`Refund of ${settings.currency_symbol} ${selectedInvoice.total.toLocaleString()} processed successfully.`);
      setSelectedInvoice(null);
      setSearchQuery('');
      setTimeout(() => setToast(''), 3500);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  };

  // Filtered Returns for History Log
  const filteredReturns = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return recentReturns.filter((ret) => {
      const d = new Date(ret.created_at);
      const retDateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const retMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const retTime = d.getTime();

      // Date Filters
      if (dateFilterMode === 'today' && retDateKey !== todayKey) return false;
      if (dateFilterMode === 'yesterday' && retDateKey !== yesterdayKey) return false;
      if (dateFilterMode === 'week' && retTime < startOfWeek.getTime()) return false;
      if (dateFilterMode === 'month' && retMonthKey !== currentMonthKey) return false;
      if (dateFilterMode === 'specific_day' && retDateKey !== specificDate) return false;
      if (dateFilterMode === 'specific_month' && retMonthKey !== specificMonth) return false;
      if (dateFilterMode === 'custom_range') {
        const start = customStartDate ? new Date(customStartDate + 'T00:00:00').getTime() : 0;
        const end = customEndDate ? new Date(customEndDate + 'T23:59:59').getTime() : Infinity;
        if (retTime < start || retTime > end) return false;
      }

      // Reason Filter
      if (reasonFilter !== 'all' && ret.reason !== reasonFilter) return false;

      // Search Query
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase().trim();
        const matchesId = (ret.id || '').toLowerCase().includes(q);
        const matchesBill = (ret.invoice_number || '').toLowerCase().includes(q);
        const matchesCustomer = (ret.customer_detail || '').toLowerCase().includes(q);
        const matchesReason = (ret.reason || '').toLowerCase().includes(q);
        const matchesStaff = (ret.processed_by || '').toLowerCase().includes(q);

        if (!matchesId && !matchesBill && !matchesCustomer && !matchesReason && !matchesStaff) {
          return false;
        }
      }

      return true;
    });
  }, [recentReturns, dateFilterMode, specificDate, specificMonth, customStartDate, customEndDate, reasonFilter, historySearch]);

  const filteredTotalAmount = filteredReturns.reduce((acc, r) => acc + (r.refund_amount || 0), 0);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden h-[calc(100vh-64px)] animate-fade-in gap-3">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-20 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
          {toast}
        </div>
      )}

      {/* Top Sub-Tab Switcher */}
      <div className="flex justify-between items-center bg-white border border-[#E2E8F0] px-4 py-2 rounded-2xl shadow-2xs shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('process')}
            className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'process'
                ? 'bg-[#F43F5E] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <RotateCcw className="w-4 h-4" /> Process Return
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <History className="w-4 h-4" /> Returns History & Logs ({recentReturns.length})
          </button>
        </div>

        <button
          onClick={loadLiveData}
          className="px-3 py-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#4F46E5]" /> Refresh
        </button>
      </div>

      {activeSubTab === 'process' ? (
        /* 2-Column POS Processing View */
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Left Column: Invoice / Item Lookup */}
          <div className="w-[420px] bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#E2E8F0]">
                <div className="p-2 bg-[#F43F5E]/10 rounded-xl text-[#F43F5E]">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-[#0F172A]">Scan Bill Barcode</h2>
                  <p className="text-[11px] text-[#64748B]">Scan bill barcode or type bill number below</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearchOrScan(searchQuery);
                }}
                className="space-y-3 mt-4"
              >
                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                    Scan Barcode or Bill #
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Scan barcode or type bill number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#4F46E5] tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-10 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-xs cursor-pointer"
                >
                  <Search className="w-4 h-4" /> Search Bill
                </button>
              </form>

              {/* Recent Store Invoices */}
              <div className="mt-5 space-y-2">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Recent Completed Bills</div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {invoices.length === 0 ? (
                    <div className="text-xs text-[#64748B] p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-center">
                      No completed bills recorded yet.
                    </div>
                  ) : (
                    invoices.slice(0, 6).map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => setSelectedInvoice(inv)}
                        className="w-full p-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl text-left flex justify-between items-center cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-[#0F172A]">{inv.invoice_number}</div>
                          <div className="text-[10px] text-[#64748B]">{inv.payment_method.toUpperCase()} • {inv.status === 'refunded' ? 'Refunded' : 'Completed'}</div>
                        </div>
                        <div className="font-extrabold text-xs text-[#4F46E5] tabular-nums">
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
                  <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
                    <div>
                      <span className="text-xs font-bold text-[#F43F5E] uppercase tracking-wider">Selected Bill</span>
                      <h3 className="text-lg font-extrabold text-[#0F172A] mt-0.5">{selectedInvoice.invoice_number}</h3>
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
                  disabled={isSubmitting || selectedInvoice.status === 'refunded'}
                  className="w-full h-12 bg-[#F43F5E] hover:bg-[#E11D48] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm cursor-pointer"
                >
                  <RotateCcw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                  {isSubmitting
                    ? 'Processing Refund...'
                    : selectedInvoice.status === 'refunded'
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
        </div>
      ) : (
        /* History & Filterable Logs View */
        <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex flex-col gap-3 overflow-hidden">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#E2E8F0]">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search return ID, bill #, reason..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#4F46E5]"
              />
              {historySearch && (
                <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-2 text-[#94A3B8] hover:text-[#0F172A]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Preset Buttons */}
            <div className="flex flex-wrap items-center bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-xs font-bold gap-1">
              {[
                { id: 'all', label: 'All Dates' },
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'specific_day', label: 'Filter Day' },
                { id: 'specific_month', label: 'Filter Month' },
                { id: 'custom_range', label: 'Custom Range' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateFilterMode(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-xs font-bold ${
                    dateFilterMode === tab.id
                      ? 'bg-[#4F46E5] text-white shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Total Filtered Stat */}
            <div className="text-xs font-bold text-[#64748B]">
              Total: <span className="text-[#F43F5E] font-extrabold">{settings.currency_symbol} {filteredTotalAmount.toLocaleString()}</span> ({filteredReturns.length} records)
            </div>
          </div>

          {/* Dynamic Filter Inputs (Specific Day, Specific Month, Custom Range) */}
          {(dateFilterMode === 'specific_day' || dateFilterMode === 'specific_month' || dateFilterMode === 'custom_range') && (
            <div className="flex items-center gap-2 text-xs font-semibold py-1">
              {dateFilterMode === 'specific_day' && (
                <div className="flex items-center gap-2 bg-[#F8FAFC] px-3 py-1 rounded-xl border border-[#E2E8F0]">
                  <Calendar className="w-3.5 h-3.5 text-[#4F46E5]" />
                  <span className="text-[#64748B]">Date:</span>
                  <input
                    type="date"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    className="bg-white border border-[#CBD5E1] px-2 py-0.5 rounded-lg text-xs font-bold"
                  />
                </div>
              )}
              {dateFilterMode === 'specific_month' && (
                <div className="flex items-center gap-2 bg-[#F8FAFC] px-3 py-1 rounded-xl border border-[#E2E8F0]">
                  <CalendarDays className="w-3.5 h-3.5 text-[#4F46E5]" />
                  <span className="text-[#64748B]">Month:</span>
                  <input
                    type="month"
                    value={specificMonth}
                    onChange={(e) => setSpecificMonth(e.target.value)}
                    className="bg-white border border-[#CBD5E1] px-2 py-0.5 rounded-lg text-xs font-bold"
                  />
                </div>
              )}
              {dateFilterMode === 'custom_range' && (
                <div className="flex items-center gap-2 bg-[#F8FAFC] px-3 py-1 rounded-xl border border-[#E2E8F0]">
                  <span className="text-[#64748B]">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-white border border-[#CBD5E1] px-2 py-0.5 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[#64748B]">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-white border border-[#CBD5E1] px-2 py-0.5 rounded-lg text-xs font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {/* Filtered Table */}
          <div className="flex-1 overflow-y-auto border border-[#E2E8F0] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-bold border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-2.5 px-3">Return ID</th>
                  <th className="py-2.5 px-3">Bill Number</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Refund Amount</th>
                  <th className="py-2.5 px-3">Processed By</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#64748B]">
                      No refund records found matching active filters.
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#F43F5E]">{ret.id.substring(0, 14)}...</td>
                      <td className="py-2.5 px-3 font-bold text-[#0F172A]">{ret.invoice_number}</td>
                      <td className="py-2.5 px-3 text-[#64748B]">{ret.customer_detail || 'Walk-in'}</td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{ret.reason}</td>
                      <td className="py-2.5 px-3 font-extrabold text-[#F43F5E] tabular-nums">
                        {settings.currency_symbol} {ret.refund_amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B]">{ret.processed_by}</td>
                      <td className="py-2.5 px-3 text-[#64748B] tabular-nums">{new Date(ret.created_at).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => setSelectedReturnDetail(ret)}
                          className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] rounded-lg font-bold text-[11px] cursor-pointer"
                        >
                          <Eye className="w-3 h-3 inline mr-1 text-[#4F46E5]" /> View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedReturnDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-1.5 text-[#F43F5E] font-bold text-sm">
                <RotateCcw className="w-4 h-4" /> Return Details
              </div>
              <button onClick={() => setSelectedReturnDetail(null)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Return ID:</span>
                <span className="font-mono font-bold text-[#F43F5E] text-[10px]">{selectedReturnDetail.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Bill #:</span>
                <span className="font-bold text-[#0F172A]">{selectedReturnDetail.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Customer:</span>
                <span className="font-semibold text-[#0F172A]">{selectedReturnDetail.customer_detail || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Cashier:</span>
                <span className="font-semibold text-[#0F172A]">{selectedReturnDetail.processed_by}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Date & Time:</span>
                <span className="font-semibold text-[#0F172A]">{new Date(selectedReturnDetail.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Reason:</span>
                <span className="font-bold text-[#4F46E5]">{selectedReturnDetail.reason}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-[#0F172A] pt-1.5 border-t border-[#E2E8F0]">
                <span>Refund Amount:</span>
                <span className="text-[#F43F5E]">{settings.currency_symbol} {selectedReturnDetail.refund_amount.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedReturnDetail(null)}
              className="w-full py-2 bg-[#4F46E5] text-white rounded-xl text-xs font-bold hover:bg-[#4338CA] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
