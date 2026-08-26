import React, { useState } from 'react';
import { Download, RefreshCw, ShieldCheck, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface UpdaterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpdaterModal: React.FC<UpdaterModalProps> = ({ isOpen, onClose }) => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('1.0.1');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateComplete, setUpdateComplete] = useState(false);

  if (!isOpen) return null;

  const handleCheckUpdate = () => {
    setChecking(true);
    // Simulate GitHub Releases Endpoint check against GITHUB_RELEASE_REPO
    setTimeout(() => {
      setChecking(false);
      setUpdateAvailable(true);
      setLatestVersion('v1.1.0-release');
    }, 1500);
  };

  const handleDownloadAndInstall = () => {
    setDownloadProgress(10);
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUpdateComplete(true);
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex justify-between items-center pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#4F46E5]" />
            <h3 className="text-lg font-bold text-[#0F172A]">Software Updater</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm text-[#64748B]">
          <div className="flex justify-between items-center bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
            <span>Current Installed Version:</span>
            <span className="font-bold text-[#0F172A] tabular-nums">v1.0.0</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            <span>Cryptographic signature & system validation enabled</span>
          </div>

          {updateAvailable && !updateComplete && (
            <div className="bg-[#4F46E5]/10 border border-[#4F46E5]/30 p-4 rounded-xl flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#4F46E5]">New Release Found:</span>
                <span className="font-extrabold text-[#4F46E5] tabular-nums">{latestVersion}</span>
              </div>
              <p className="text-xs text-[#0F172A]">
                Includes sub-second offline sync performance patches, enhanced hardware printer drivers, and security hotfixes.
              </p>

              {downloadProgress > 0 && (
                <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-[#4F46E5] h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {updateComplete && (
            <div className="bg-[#10B981]/10 border border-[#10B981]/30 p-4 rounded-xl flex items-center gap-3 text-[#10B981]">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <div className="font-bold">Update Ready!</div>
                <div className="text-xs text-[#0F172A]">
                  New version has been downloaded and verified. Restart software to apply changes.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {!updateAvailable && (
            <button
              onClick={handleCheckUpdate}
              disabled={checking}
              className="h-11 px-5 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl flex items-center gap-2 text-sm shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking for Updates...' : 'Check for Updates'}
            </button>
          )}

          {updateAvailable && !updateComplete && (
            <button
              onClick={handleDownloadAndInstall}
              disabled={downloadProgress > 0}
              className="h-11 px-5 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-xl flex items-center gap-2 text-sm shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {downloadProgress > 0 ? `Downloading ${downloadProgress}%` : 'Download & Install Now'}
            </button>
          )}

          {updateComplete && (
            <button
              onClick={() => window.location.reload()}
              className="h-11 px-5 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-xl text-sm shadow-xs cursor-pointer"
            >
              Restart Software Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
