import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable Chromium shader cache disk errors and sandbox issues on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow = null;
let autoUpdater = null;

// Determine window icon path
function getWindowIcon() {
  const icoPath = path.join(__dirname, 'public', 'zentura-logo.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.join(__dirname, 'public', 'zentura-logo.png');
  if (fs.existsSync(pngPath)) return pngPath;
  return undefined;
}

// Dynamically import electron-updater gracefully
async function initAutoUpdater() {
  try {
    const pkg = await import('electron-updater');
    autoUpdater = pkg.autoUpdater || pkg.default?.autoUpdater;
    if (autoUpdater) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('checking-for-update', () => {
        console.log('🔍 Checking for desktop updates...');
      });

      autoUpdater.on('update-available', (info) => {
        console.log('✨ Update available:', info?.version);
        if (mainWindow) mainWindow.webContents.send('update-available', info);
      });

      autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent || 0);
        console.log(`📥 Download progress: ${percent}%`);
        if (mainWindow) mainWindow.webContents.send('download-progress', percent);
      });

      autoUpdater.on('update-downloaded', (info) => {
        console.log('✅ Update downloaded and verified:', info?.version);
        if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
      });

      autoUpdater.on('error', (err) => {
        console.warn('⚠️ Auto-updater notice:', err?.message || err);
      });
    }
  } catch (e) {
    // dev mode fallback
  }
}

function createWindow() {
  const windowIcon = getWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Zentura POS Cashier Terminal',
    autoHideMenuBar: true,
    icon: windowIcon,
    show: false,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates on startup if packaged
  if (!isDev && autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify?.().catch(() => {});
    }, 4000);
  }
}

app.whenReady().then(async () => {
  await initAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Listeners & Handlers
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  if (autoUpdater) {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo || { version: app.getVersion() };
    } catch (err) {
      console.warn('Manual update check notice:', err?.message);
      return null;
    }
  }
  return null;
});

ipcMain.on('restart-and-install', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall?.();
  }
});

ipcMain.handle('shell:open-external', (_, url) => {
  if (url && typeof url === 'string' && url.startsWith('http')) {
    shell.openExternal(url);
  }
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});
