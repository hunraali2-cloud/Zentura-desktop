import React, { useState, useEffect } from 'react';
import { RegisterView } from './views/RegisterView';
import { StockInwardView } from './views/StockInwardView';
import { AttendanceView } from './views/AttendanceView';
import { RefundsView } from './views/RefundsView';
import { ExpensesView } from './views/ExpensesView';
import { UpdaterModal } from './components/UpdaterModal';
import { CashierAuthModal } from './components/CashierAuthModal';
import { NetworkStatusBadge } from './components/NetworkStatusBadge';
import { dbSync, User } from '@zentura/database';
import { ShoppingBag, PackageCheck, Clock, Download, Store, RotateCcw, UserCheck, LogOut, Lock, Wallet } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'register' | 'stock' | 'refunds' | 'expenses' | 'attendance'>('register');
  const [showUpdaterModal, setShowUpdaterModal] = useState(false);
  const [activeCashier, setActiveCashier] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [enableUdhaar, setEnableUdhaar] = useState(true);

  const [storeSettings, setStoreSettings] = useState(dbSync.getStoreSettings());

  useEffect(() => {
    // Load store settings live
    const loadSettings = () => {
      const s = dbSync.getStoreSettings();
      setStoreSettings(s);
      setEnableUdhaar(s.enable_udhaar ?? true);
    };
    loadSettings();
    const unsubscribe = dbSync.subscribe(loadSettings);

    const handleOnline = async () => {
      console.log('⚡ Network online in App. Triggering syncNow...');
      try {
        await dbSync.syncNow();
      } catch (e) {
        console.warn('Auto-sync error on reconnect:', e);
      }
      loadSettings();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const handleLogout = () => {
    setActiveCashier(null);
    setShowAuthModal(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] overflow-hidden select-none">
      {/* Top Application Header */}
      <header className="h-16 bg-white border-b border-[#E2E8F0] px-6 flex justify-between items-center shrink-0 shadow-2xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/zentura-logo.png" alt="Zentura POS" className="w-9 h-9 rounded-xl object-contain shadow-xs" />
            <div>
              <div className="font-extrabold text-[#0F172A] text-base leading-tight">Zentura POS</div>
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Cashier Counter</div>
            </div>
          </div>

          {/* View Switcher Tabs */}
          <nav className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0]">
            <button
              onClick={() => setActiveTab('register')}
              className={`h-9 px-3.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white text-[#4F46E5] shadow-2xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <ShoppingBag className="w-4 h-4" /> Billing Counter
            </button>

            <button
              onClick={() => setActiveTab('stock')}
              className={`h-9 px-3.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'stock'
                  ? 'bg-white text-[#4F46E5] shadow-2xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <PackageCheck className="w-4 h-4" /> Add Stock
            </button>

            <button
              onClick={() => setActiveTab('refunds')}
              className={`h-9 px-3.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'refunds'
                  ? 'bg-white text-[#F43F5E] shadow-2xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <RotateCcw className="w-4 h-4" /> Refunds & Returns
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={`h-9 px-3.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-white text-[#4F46E5] shadow-2xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Wallet className="w-4 h-4" /> Daily Expenses
            </button>

            <button
              onClick={() => setActiveTab('attendance')}
              className={`h-9 px-3.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'attendance'
                  ? 'bg-white text-[#4F46E5] shadow-2xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Clock className="w-4 h-4" /> Staff Clock-In
            </button>
          </nav>
        </div>

        {/* Right Header Status & Cashier Badge */}
        <div className="flex items-center gap-3">
          {/* Live Online / Offline / Syncing Network Badge */}
          <NetworkStatusBadge />

          {/* Active Store Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A]">
            <Store className="w-3.5 h-3.5 text-[#10B981]" />
            <span>{storeSettings.store_name || 'Active Store'}</span>
          </div>

          {/* Authenticated Cashier Badge or Login Trigger */}
          {activeCashier ? (
            <div className="flex items-center gap-2 bg-[#4F46E5]/10 border border-[#4F46E5]/30 px-3 py-1.5 rounded-xl text-xs">
              <UserCheck className="w-4 h-4 text-[#4F46E5]" />
              <div className="text-left">
                <div className="font-extrabold text-[#0F172A] leading-tight">{activeCashier.name}</div>
                <div className="text-[9px] font-bold text-[#4F46E5] uppercase tracking-wider">
                  {activeCashier.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="ml-1 p-1 bg-white hover:bg-[#FFF1F2] text-[#F43F5E] rounded-lg transition-colors cursor-pointer border border-[#E2E8F0]"
                title="Log Out & Lock Terminal"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" /> Unlock Kiosk
            </button>
          )}

          <button
            onClick={() => setShowUpdaterModal(true)}
            className="h-9 px-3.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] font-bold rounded-lg text-xs flex items-center gap-1.5 border border-[#E2E8F0] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#4F46E5]" /> Updates
          </button>
        </div>
      </header>

      {/* Main Active Screen */}
      <main className="flex-1 overflow-hidden animate-fade-in">
        {activeTab === 'register' && <RegisterView enableUdhaar={enableUdhaar} cashier={activeCashier} />}
        {activeTab === 'stock' && <StockInwardView cashier={activeCashier} />}
        {activeTab === 'refunds' && <RefundsView cashier={activeCashier} />}
        {activeTab === 'expenses' && <ExpensesView cashier={activeCashier} />}
        {activeTab === 'attendance' && <AttendanceView cashier={activeCashier} />}
      </main>

      {/* Cashier PIN Auth Kiosk Modal */}
      <CashierAuthModal
        isOpen={showAuthModal}
        allowClose={Boolean(activeCashier)}
        onSuccess={(cashier) => {
          setActiveCashier(cashier);
          setShowAuthModal(false);
        }}
        onClose={() => setShowAuthModal(false)}
      />

      {/* GitHub Releases Updater Modal */}
      <UpdaterModal
        isOpen={showUpdaterModal}
        onClose={() => setShowUpdaterModal(false)}
      />
    </div>
  );
};
