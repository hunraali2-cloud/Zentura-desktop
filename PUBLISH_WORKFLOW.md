# Zentura Cashier Desktop - Publish & Distribution Workflow

## Overview
The publish workflow automatically builds the Zentura POS Cashier desktop application and synchronizes release files to the `zentura-releases-repo` distribution repository for automatic terminal updates and direct installer downloads.

---

## Directory Architecture
```
01 Pos Software/
├── Zentura Desktop/                 (Main desktop application source)
│   ├── src/                         (React + Tailwind UI)
│   ├── packages/                    (Offline DB & Thermal ESC/POS Engine)
│   ├── scripts/
│   │   ├── publish-updates.js       (Syncs build artifacts & pushes to GitHub)
│   │   └── setup-electron.js        (Configures Electron binaries)
│   ├── launch.js                    (Starts Vite + Electron dev window)
│   ├── main.js                      (Electron main process & auto-updater)
│   ├── preload.js                   (Secure contextBridge IPC bridge)
│   └── package.json                 (electron-builder distribution config)
│
├── zentura-releases-repo/           (Standalone GitHub distribution repository)
│   ├── latest.yml                   (Version metadata & SHA-512 blockmaps)
│   ├── Zentura Cashier Setup X.X.X.exe (Windows NSIS Installers)
│   ├── Zentura Cashier Setup X.X.X.exe.blockmap
│   └── win-unpacked/
│
└── Zentura Web/                     (Web dashboard & Super Admin console)
    └── src/App.tsx                  (Desktop Releases Hub)
```

---

## Running Development Server
To start the cashier application in development with live hot-reloading:

```bash
cd "D:\Working\01 Pos Software\Zentura Desktop"
npm start
```
This automatically:
1. Verifies Electron binaries.
2. Boots the Vite dev server on `http://localhost:5173`.
3. Launches the native Electron window with context isolation and auto-updater hooks.

---

## Building and Publishing Releases

### 1. Full Build & Auto-Publish to GitHub
```bash
npm run publish
```
This command performs:
1. **Frontend compilation**: `vite build` creates optimized production bundle in `dist/`.
2. **Native packaging**: `electron-builder` packages the app into `../zentura-releases-repo`.
3. **Artifact synchronization**: `scripts/publish-updates.js` stages the installers and `latest.yml`.
4. **Git push**: Commits with version timestamp and pushes to `https://github.com/hunraali2-cloud/Zentura-releases.git`.
5. **Super Admin sync**: Registers release details into the Supabase database for the Super Admin Desktop Releases Hub (`localhost:3000/superadmin`).

### 2. Fast Build (Store Compression)
For quick test releases without heavy compression:
```bash
npm run publish:fast
```

### 3. Local Installer Build Only (No Push)
To generate the `.exe` installer locally without pushing to GitHub:
```bash
npm run dist
```

---

## Auto-Update Distribution Config
In `Zentura Desktop/package.json`:
- **Repository**: `https://github.com/hunraali2-cloud/Zentura-releases.git`
- **Owner**: `hunraali2-cloud`
- **Repo**: `Zentura-releases`
- **Output Directory**: `../zentura-releases-repo`

Terminals running the app will automatically check for new releases on startup and can also check manually via the **Software Updates** modal in the Cashier header.
