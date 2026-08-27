import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_ELECTRON_DIR = path.resolve(__dirname, '../node_modules/electron');
const LOCAL_ELECTRON_EXE = path.join(LOCAL_ELECTRON_DIR, 'dist/electron.exe');
const SOURCE_ELECTRON_DIR = 'D:\\Working\\Metadata Website\\TagifyPro Desktop\\TagifyPro-Desktop-v2\\node_modules\\electron';

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return false;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const items = fs.readdirSync(src);
    for (const item of items) {
      copyRecursiveSync(path.join(src, item), path.join(dest, item));
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
  return true;
}

export function ensureElectronInstalled() {
  if (fs.existsSync(LOCAL_ELECTRON_EXE)) {
    return true;
  }

  console.log('⚡ Local Electron binary not found in Zentura Desktop. Setting up from TagifyPro cache...');
  if (fs.existsSync(SOURCE_ELECTRON_DIR)) {
    try {
      copyRecursiveSync(SOURCE_ELECTRON_DIR, LOCAL_ELECTRON_DIR);
      if (fs.existsSync(LOCAL_ELECTRON_EXE)) {
        console.log('✅ Local Electron installed successfully into node_modules/electron!');
        return true;
      }
    } catch (err) {
      console.warn('⚠️ Could not copy local Electron binary:', err.message);
    }
  }
  return false;
}

// If run directly via `node scripts/setup-electron.js`
if (process.argv[1] === __filename) {
  const ok = ensureElectronInstalled();
  if (ok) {
    console.log('🎉 Setup complete: Electron is ready.');
  } else {
    console.log('ℹ️ Setup finished: Will use system npx electron fallback.');
  }
}
