import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, X, Download, Upload, FolderDown, History, 
  CheckCircle2, AlertCircle, FileSpreadsheet, Layers, 
  Users, RefreshCw, HardDrive, Trash2
} from 'lucide-react';
import { dbSync, backupService, BackupRecord } from '@zentura/database';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'history'>('backup');
  const [lastBackup, setLastBackup] = useState<string>(backupService.getLastBackupTime());
  const [history, setHistory] = useState<BackupRecord[]>(backupService.getBackupHistory());

  const [backingUp, setBackingUp] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const refreshState = () => {
    setLastBackup(backupService.getLastBackupTime());
    setHistory(backupService.getBackupHistory());
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
      const unsubscribe = backupService.subscribe(refreshState);
      return () => unsubscribe();
    }
  }, [isOpen]);

  // 1. Download Backup Action
  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await backupService.backupNow();
      refreshState();
      showToast(`✓ ${res.message || 'Backup file downloaded successfully!'}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Error creating backup file.', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  // 2. Restore from Local JSON File
  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const payload = JSON.parse(content);
        if (!confirm(`Restore database from file "${file.name}"? This will update local products, inventory, and sales records.`)) return;

        setRestoring(true);
        const result = await backupService.restoreDatabase(payload);
        if (result.success) {
          showToast(`✓ ${result.message}`, 'success');
          refreshState();
        } else {
          showToast(result.message, 'error');
        }
      } catch (err: any) {
        showToast('Invalid backup file JSON: ' + (err?.message || ''), 'error');
      } finally {
        setRestoring(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearHistory = () => {
    if (confirm('Clear backup download history list on this device?')) {
      backupService.clearBackupHistory();
      refreshState();
      showToast('Backup history cleared.');
    }
  };

  if (!isOpen) return null;

  const currentProducts = dbSync.getProducts();
  const currentInvoices = dbSync.getInvoices();
  const currentCategories = dbSync.getCategories();
  const currentCustomers = dbSync.getCustomers();
  const currentSettings = dbSync.getStoreSettings();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#4F46E5]/10 rounded-2xl flex items-center justify-center text-[#4F46E5] shadow-xs shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#0F172A] leading-tight">Database Backup & Restore</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B]">
                <span>Last backup: <b className="text-[#0F172A]">{lastBackup}</b></span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-xl cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div
            className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2.5 shadow-xs ${
              toastMsg.type === 'success'
                ? 'bg-[#10B981]/10 text-[#065F46] border border-[#10B981]/30'
                : 'bg-[#FFF1F2] text-[#F43F5E] border border-[#FECDD3]'
            }`}
          >
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'backup'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <Download className="w-3.5 h-3.5" /> Backup Data (Download)
          </button>

          <button
            onClick={() => setActiveTab('restore')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'restore'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <FolderDown className="w-3.5 h-3.5" /> Restore Database
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Backup History ({history.length})
          </button>
        </div>

        {/* TAB 1: BACKUP DATA (DOWNLOAD) */}
        {activeTab === 'backup' && (
          <div className="space-y-5 animate-fade-in">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="font-extrabold text-sm text-[#0F172A]">Store Snapshot Ready</h3>
                  <p className="text-xs text-[#64748B]">
                    All active inventory, sales bills, categories, customers, and settings will be bundled into a JSON file.
                  </p>
                </div>
                <span className="px-3 py-1 bg-[#4F46E5]/10 text-[#4F46E5] rounded-full text-xs font-bold shrink-0">
                  {currentSettings.store_name || 'Active Store'}
                </span>
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-[#4F46E5] shrink-0" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Products</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentProducts.length} items</div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#10B981] shrink-0" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Sales Bills</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentInvoices.length} bills</div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Categories</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentCategories.length} cats</div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[#EC4899] shrink-0" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Customers</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentCustomers.length} users</div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleBackupNow}
              disabled={backingUp}
              className="w-full h-13 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-2xl flex items-center justify-center gap-2.5 shadow-xs transition-all text-sm cursor-pointer disabled:opacity-50"
            >
              {backingUp ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating & Downloading Backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Backup Now (Download JSON File)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB 2: RESTORE DATABASE */}
        {activeTab === 'restore' && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#10B981]" /> Restore from Backup File (.json)
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Select any previously downloaded Zentura POS backup file from your computer to restore products, invoices, stock logs, and settings.
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                onChange={handleLocalFileSelect}
                className="hidden"
              />

              <div
                onClick={() => !restoring && fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#CBD5E1] hover:border-[#4F46E5] bg-[#F8FAFC] hover:bg-white rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3"
              >
                <div className="w-12 h-12 bg-[#4F46E5]/10 text-[#4F46E5] rounded-2xl flex items-center justify-center mx-auto">
                  {restoring ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-[#0F172A]">
                    {restoring ? 'Restoring Database...' : 'Click to Choose Backup File (.json)'}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Supports Zentura POS backup files
                  </div>
                </div>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-xs text-[#64748B] space-y-1">
                <div className="font-bold text-[#0F172A]">Important Notes:</div>
                <div>• Restoring will merge/update existing products, sales, and settings.</div>
                <div>• Data is saved immediately to local storage and synced to cloud if online.</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BACKUP HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-fade-in">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl space-y-2">
                <History className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p>No backup history records yet. Click "Backup Now" to download your first backup.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#64748B]">Recent backups on this device</span>
                  <button
                    onClick={handleClearHistory}
                    className="text-[#F43F5E] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear History
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {history.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex justify-between items-center text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-[#0F172A] truncate max-w-sm">{rec.fileName}</div>
                        <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
                          <span>{rec.createdAt}</span>
                          <span>•</span>
                          <span className="font-bold">{rec.sizeFormatted}</span>
                          <span>•</span>
                          <span className="text-[#10B981] font-bold">💾 Downloaded</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-lg text-[10px] font-bold text-[#4F46E5]">
                          {rec.itemCounts?.products || 0} prods
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const GoogleDriveModal = BackupModal;
