delete process.env.ELECTRON_RUN_AS_NODE;

import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { ensureElectronInstalled } from './scripts/setup-electron.js';
import { setupIcons } from './scripts/generate-icons.js';

console.log('🚀 Starting Zentura POS Cashier Desktop App (Vite + Electron)...');

// Automatically ensure Electron binaries and Custom Icons are ready
try {
  ensureElectronInstalled();
  setupIcons();
} catch (e) {
  // Proceed with discovery
}

const env = {
  ...process.env,
  NODE_ENV: 'development'
};

// 1. Locate Electron binary
function getElectronLauncher() {
  const localExe = path.resolve('./node_modules/electron/dist/electron.exe');
  if (fs.existsSync(localExe)) {
    return { cmd: localExe, args: ['.'], useShell: false };
  }

  const fallbackExe = 'D:\\Working\\Metadata Website\\TagifyPro Desktop\\TagifyPro-Desktop-v2\\node_modules\\electron\\dist\\electron.exe';
  if (fs.existsSync(fallbackExe)) {
    // When executing binary directly with Node child_process, shell: false avoids Windows path-with-spaces bugs
    return { cmd: fallbackExe, args: ['.'], useShell: false };
  }

  return { cmd: 'npx', args: ['electron', '.'], useShell: true };
}

// 2. Start Vite local dev server
const vite = spawn('npx', ['vite', '--host', '--port', '5173'], {
  stdio: 'inherit',
  shell: true,
  env
});

// 3. Poll http://localhost:5173 with native Node http module
function waitForVite(callback) {
  const req = http.get('http://localhost:5173', () => {
    console.log('✅ Vite Dev Server is ready. Opening Cashier Window...');
    callback();
  });

  req.on('error', () => {
    setTimeout(() => waitForVite(callback), 400);
  });
}

// 4. Launch Electron window once Vite responds
waitForVite(() => {
  const { cmd, args, useShell } = getElectronLauncher();
  console.log(`🖥️ Launching Electron Cashier Window using: ${cmd}`);

  const electron = spawn(cmd, args, {
    stdio: 'inherit',
    shell: useShell,
    env
  });

  electron.on('error', (err) => {
    console.error('❌ Failed to launch Electron process:', err);
  });

  electron.on('exit', (code) => {
    try {
      vite.kill();
    } catch {}
    process.exit(code || 0);
  });
});

vite.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    process.exit(code);
  }
});
