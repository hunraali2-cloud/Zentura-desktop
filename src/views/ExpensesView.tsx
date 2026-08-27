import React, { useState, useEffect } from 'react';
import { dbSync, Expense, User } from '@zentura/database';
import { Wallet, Plus, Trash2, CheckCircle2, Calendar, DollarSign, Tag } from 'lucide-react';

interface ExpensesViewProps {
  cashier?: User | null;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ cashier }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Tea & Snacks');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settings = dbSync.getStoreSettings();

  const categories = [
    'Tea & Snacks',
    'Electricity & Water',
    'Shop Rent',
    'Cleaning & Supplies',
    'Maintenance & Repair',
    'Staff Advance / Salary',
    'Transport & Freight',
    'Other Expenses'
  ];

  const loadExpenses = () => {
    setExpenses(dbSync.getExpenses());
  };

  useEffect(() => {
    loadExpenses();
    dbSync.fetchExpenses().then(setExpenses);
    const unsubscribe = dbSync.subscribe(loadExpenses);
    return () => unsubscribe();
  }, []);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const numAmount = parseFloat(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const newExp = dbSync.saveExpense({
        title: title.trim(),
        amount: numAmount,
        category,
        notes: notes.trim(),
        cashier_name: cashier ? cashier.name : 'Cashier Counter'
      });

      setTitle('');
      setAmount('');
      setNotes('');
      setToast(`Saved Expense: ${newExp.title} (${settings.currency_symbol} ${numAmount.toLocaleString()})`);
      setTimeout(() => setToast(''), 3500);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  };

  const handleDelete = (exp: Expense) => {
    if (confirm(`Are you sure you want to delete expense "${exp.title}"?`)) {
      dbSync.deleteExpense(exp.id);
      setToast(`Deleted Expense: ${exp.title}`);
      setTimeout(() => setToast(''), 3500);
    }
  };

  // Calculations for Today & Total
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const todayExpenses = expenses.filter(
    (e) => new Date(e.created_at).getTime() >= startOfToday
  );
  const todayTotal = todayExpenses.reduce((acc, e) => acc + e.amount, 0);
  const grandTotal = expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden h-[calc(100vh-64px)] animate-fade-in">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-20 right-6 bg-[#10B981] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold animate-fade-in">
          <CheckCircle2 className="w-5 h-5" />
          {toast}
        </div>
      )}

      {/* Left Column: Form to Add New Expense */}
      <div className="w-[380px] bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E2E8F0] text-[#4F46E5]">
          <div className="p-2 bg-[#4F46E5]/10 rounded-xl">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#0F172A]">Record Store Expense</h2>
            <p className="text-[11px] text-[#64748B]">Add daily shop expenses in simple English</p>
          </div>
        </div>

        <form onSubmit={handleAddExpense} className="flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Expense Description / Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tea & Biscuits for Guests"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Amount ({settings.currency_symbol}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-extrabold text-[#0F172A] focus:outline-none focus:border-[#4F46E5] tabular-nums"
                />
                <span className="absolute left-3 top-2.5 text-[#64748B] font-bold text-sm">
                  {settings.currency_symbol}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Expense Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#4F46E5]"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Write any extra detail..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer text-sm mt-4"
          >
            <Plus className={`w-5 h-5 ${isSubmitting ? 'animate-spin' : ''}`} />
            {isSubmitting ? 'Recording Expense...' : 'Record Expense'}
          </button>
        </form>
      </div>

      {/* Right Column: Expense Stats & List */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* KPI Cards (Today's Expenses Only for Cashier Counter) */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-2xl shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-[#64748B] font-bold">Today's Expenses</div>
              <div className="text-2xl font-extrabold text-[#F43F5E] tabular-nums mt-1">
                {settings.currency_symbol} {todayTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Recorded today at cashier counter</div>
            </div>
            <div className="p-3 bg-[#F43F5E]/10 rounded-2xl text-[#F43F5E]">
              <Calendar className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] p-4 rounded-2xl shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-[#64748B] font-bold">Today's Expense Entries</div>
              <div className="text-2xl font-extrabold text-[#0F172A] tabular-nums mt-1">
                {todayExpenses.length} Entries
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Logged on current shift</div>
            </div>
            <div className="p-3 bg-[#4F46E5]/10 rounded-2xl text-[#4F46E5]">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Expenses List */}
        <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col overflow-hidden">
          <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
            <h3 className="text-base font-bold text-[#0F172A]">Recent Shop Expenses</h3>
            <span className="text-xs font-bold text-[#64748B]">Sorted by Latest</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0] py-2">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-2 py-12">
                <Wallet className="w-10 h-10 opacity-30 text-[#4F46E5]" />
                No expenses recorded yet. Use the form on the left to add shop expenses.
              </div>
            ) : (
              expenses.map((exp) => (
                <div key={exp.id} className="py-3.5 flex items-center justify-between hover:bg-[#F8FAFC] px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#F43F5E]/10 text-[#F43F5E] flex items-center justify-center font-bold shrink-0">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-[#0F172A] text-sm flex items-center gap-2">
                        {exp.title}
                        <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#64748B] rounded-md text-[10px] font-bold">
                          {exp.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">
                        Logged by: <strong className="text-[#0F172A]">{exp.cashier_name || 'Staff'}</strong> • {new Date(exp.created_at).toLocaleString()}
                        {exp.notes && <span className="ml-2 italic text-[#475569]">— "{exp.notes}"</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right font-extrabold text-[#F43F5E] text-base tabular-nums">
                      -{settings.currency_symbol} {exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <button
                      onClick={() => handleDelete(exp)}
                      className="p-1.5 bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#F43F5E] rounded-lg transition-colors cursor-pointer border border-[#F43F5E]/30"
                      title="Delete Expense"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
