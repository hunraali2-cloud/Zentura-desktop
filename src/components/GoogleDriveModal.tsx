import React, { useState, useEffect, useRef } from 'react';
import { 
  Cloud, X, Upload, FolderDown, History, CheckCircle2, 
  AlertCircle, Database, FileSpreadsheet, Layers, 
  RefreshCw, HardDrive, LogOut, ExternalLink 
} from 'lucide-react';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'history'>('backup');
  const [isConnected, setIsConnected] = useState<boolean>(googleDriveService.isConnected());
  const [lastBackup, setLastBackup] = useState<string>(googleDriveService.getLastBackupTime());
  const [history, setHistory] = useState<BackupRecord[]>(googleDriveService.getBackupHistory());
  const [driveFiles, setDriveFiles] = useState<DriveApiFile[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState<boolean>(false);

  const [backingUp, setBackingUp] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const refreshState = () => {
    setIsConnected(googleDriveService.isConnected());
    setLastBackup(googleDriveService.getLastBackupTime());
    setHistory(googleDriveService.getBackupHistory());
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
      const unsubscribe = googleDriveService.subscribe(refreshState);
      if (googleDriveService.isConnected()) {
        loadDriveFiles();
      }
      return () => unsubscribe();
    }
  }, [isOpen]);

  const loadDriveFiles = async () => {
    setLoadingDriveFiles(true);
    try {
      const files = await googleDriveService.listDriveBackups();
      setDriveFiles(files);
    } catch (e) {
      console.warn('Error loading drive files:', e);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  // 1-Click Google Sign-In
  const handleGoogleSignIn = async () => {
    setAuthenticating(true);
    try {
      const ok = await googleDriveService.loginWithGoogle(true);
      if (ok) {
        showToast('✓ Connected to Google Drive successfully!', 'success');
        loadDriveFiles();
      } else {
        showToast('Google Sign-In was cancelled or access denied.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error during Google sign in.', 'error');
    } finally {
      setAuthenticating(false);
    }
  };

  // 1. Backup Now Action
  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await googleDriveService.backupNow();
      refreshState();
      if (res.uploadedToDrive) {
        showToast('✓ Backup saved to Google Drive and downloaded locally!', 'success');
        loadDriveFiles();
      } else {
        showToast('✓ Backup downloaded locally. Connect Google Drive for cloud backups.', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error creating backup.', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  // 2. Restore from Google Drive File
  const handleRestoreFromDrive = async (file: DriveApiFile) => {
    if (!confirm(`Restore full database from Google Drive backup "${file.name}"? This will update local products, inventory, and sales records.`)) return;

    setRestoring(true);
    try {
      const payload = await googleDriveService.downloadDriveBackup(file.id);
      if (!payload) throw new Error('Could not download backup file from Google Drive.');

      const result = await googleDriveService.restoreDatabase(payload);
      if (result.success) {
        showToast(result.message, 'success');
        refreshState();
      } else {
        showToast(result.message, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error restoring from Google Drive.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  // 3. Restore from Local JSON File
  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const payload = JSON.parse(content);
        if (!confirm(`Restore database from file "${file.name}"?`)) return;

        setRestoring(true);
        const result = await googleDriveService.restoreDatabase(payload);
        if (result.success) {
          showToast(result.message, 'success');
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

  const handleDisconnect = () => {
    if (confirm('Disconnect Google Drive?')) {
      googleDriveService.disconnect();
      setDriveFiles([]);
      showToast('Google Drive disconnected.');
    }
  };

  if (!isOpen) return null;

  const currentProducts = dbSync.getProducts();
  const currentInvoices = dbSync.getInvoices();
  const currentCategories = dbSync.getCategories();
  const currentSettings = dbSync.getStoreSettings();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#4F46E5]/10 rounded-2xl flex items-center justify-center text-[#4F46E5] shadow-xs shrink-0">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#0F172A] leading-tight">Google Drive Backup</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                <span className="text-[#64748B]">
                  Last backup: <b className="text-[#0F172A]">{lastBackup}</b>
                </span>
                <span className="text-[#CBD5E1] hidden sm:inline">•</span>
                <span className="flex items-center gap-1 font-bold">
                  Status:
                  {isConnected ? (
                    <span className="text-[#10B981] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Connected ({googleDriveService.getConnectedEmail()})
                    </span>
                  ) : (
                    <span className="text-[#F59E0B] flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Not Connected
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {!isConnected ? (
              <button
                onClick={handleGoogleSignIn}
                disabled={authenticating}
                className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] rounded-xl font-bold text-xs flex items-center gap-2 shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{authenticating ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="px-2.5 py-1.5 bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#F43F5E] rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors border border-[#FECDD3]"
                title="Disconnect Google Drive Account"
              >
                <LogOut className="w-3.5 h-3.5" /> Disconnect
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
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
            <Upload className="w-3.5 h-3.5" /> Backup Now
          </button>

          <button
            onClick={() => {
              setActiveTab('restore');
              if (isConnected) loadDriveFiles();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'restore'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            <FolderDown className="w-3.5 h-3.5" /> Restore Backup
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

        {/* TAB 1: BACKUP NOW */}
        {activeTab === 'backup' && (
          <div className="space-y-5 animate-fade-in">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="font-extrabold text-sm text-[#0F172A]">Store Snapshot Ready</h3>
                  <p className="text-xs text-[#64748B]">All active inventory, sales invoices, categories, and settings will be bundled.</p>
                </div>
                <span className="px-3 py-1 bg-[#4F46E5]/10 text-[#4F46E5] rounded-full text-xs font-bold shrink-0">
                  {currentSettings.store_name || 'Active Store'}
                </span>
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-3">
                  <Database className="w-5 h-5 text-[#4F46E5]" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Products</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentProducts.length} items</div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-[#10B981]" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Sales Bills</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentInvoices.length} invoices</div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl flex items-center gap-3">
                  <Layers className="w-5 h-5 text-[#F59E0B]" />
                  <div>
                    <div className="text-[#64748B] text-[10px] uppercase font-bold">Categories</div>
                    <div className="font-extrabold text-[#0F172A] text-sm">{currentCategories.length} cats</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleBackupNow}
                disabled={backingUp}
                className="flex-1 h-13 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm cursor-pointer disabled:opacity-50"
              >
                {backingUp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Backing Up to Cloud & Device...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-5 h-5" />
                    <span>Backup Now ({isConnected ? 'Upload to Drive' : 'Download File'})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: RESTORE BACKUP */}
        {activeTab === 'restore' && (
          <div className="space-y-5 animate-fade-in">
            {/* Option A: Restore from Google Drive */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-[#4F46E5]" /> Backups from Google Drive
                </h3>
                {isConnected && (
                  <button
                    onClick={loadDriveFiles}
                    disabled={loadingDriveFiles}
                    className="text-xs text-[#4F46E5] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDriveFiles ? 'animate-spin' : ''}`} /> Refresh Drive
                  </button>
                )}
              </div>

              {!isConnected ? (
                <div className="p-5 bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-2xl text-center space-y-3 text-xs">
                  <p className="text-[#64748B]">Sign in with your Google account to browse and restore backups directly from Google Drive.</p>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={authenticating}
                    className="px-5 py-2.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] rounded-xl font-bold text-xs cursor-pointer inline-flex items-center gap-2.5 shadow-2xs transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>{authenticating ? 'Connecting...' : 'Sign in with Google to View Cloud Backups'}</span>
                  </button>
                </div>
              ) : loadingDriveFiles ? (
                <div className="p-6 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#4F46E5]" /> Loading files from Google Drive...
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-center text-xs text-[#64748B]">
                  No Zentura POS backups found on your Google Drive yet. Run a backup first.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl flex justify-between items-center text-xs transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-[#0F172A]">{file.name}</div>
                        <div className="text-[10px] text-[#64748B]">
                          Created: {new Date(file.createdTime).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreFromDrive(file)}
                        disabled={restoring}
                        className="px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs transition-colors disabled:opacity-50"
                      >
                        {restoring ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Option B: Restore from Local File */}
            <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
              <h3 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#10B981]" /> Restore from Local Backup File (.json)
              </h3>
              <p className="text-xs text-[#64748B]">Select any previously downloaded Zentura POS backup file from your computer.</p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                onChange={handleLocalFileSelect}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={restoring}
                className="w-full h-11 border-2 border-dashed border-[#CBD5E1] hover:border-[#4F46E5] bg-[#F8FAFC] hover:bg-white rounded-xl text-xs font-bold text-[#4F46E5] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4" /> Choose Local Backup File (.json) to Restore
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: BACKUP HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3 animate-fade-in">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl space-y-2">
                <History className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p>No backup history records yet. Click "Backup Now" to create your first backup.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#0F172A]">{rec.fileName}</div>
                      <div className="flex items-center gap-2 text-[10px] text-[#64748B] mt-0.5">
                        <span>{rec.createdAt}</span>
                        <span>•</span>
                        <span className="font-bold">{rec.sizeFormatted}</span>
                        <span>•</span>
                        <span className="text-[#10B981] font-bold">
                          {rec.status === 'uploaded_to_drive' ? '☁ Google Drive' : '💾 Local File'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {rec.driveViewLink && (
                        <a
                          href={rec.driveViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-[#4F46E5] hover:bg-white rounded-lg border border-[#E2E8F0]"
                          title="View on Google Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
