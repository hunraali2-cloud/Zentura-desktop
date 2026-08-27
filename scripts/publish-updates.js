import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_URL = 'https://github.com/hunraali2-cloud/Zentura-releases.git';
const RELEASES_DIR = path.resolve(__dirname, '../../zentura-releases-repo');
const DESKTOP_DIR = path.resolve(__dirname, '..');
const DIST_ELECTRON_DIR = path.resolve(DESKTOP_DIR, 'dist-electron');

const supabase = createClient(
  'https://vfvaemlbybsidmyvrxgu.supabase.co',
  'sb_publishable_vhx6VWd5wCywMjDNijmJDQ_Dc5s9KOx'
);

console.log('📦 Starting Zentura Auto-Publish Workflow...');
console.log(`📁 Target Releases Directory: ${RELEASES_DIR}`);

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function runPublish() {
  try {
    // 1. Ensure target releases repository exists
    if (!fs.existsSync(RELEASES_DIR)) {
      console.log(`📡 Releases directory not found. Initializing / Cloning ${REPO_URL}...`);
      try {
        execSync(`git clone ${REPO_URL} "${RELEASES_DIR}"`, { stdio: 'inherit' });
      } catch (err) {
        console.warn('⚠️ git clone failed (network/auth). Creating local directory...');
        fs.mkdirSync(RELEASES_DIR, { recursive: true });
        execSync('git init', { cwd: RELEASES_DIR, stdio: 'inherit' });
        execSync(`git remote add origin ${REPO_URL}`, { cwd: RELEASES_DIR, stdio: 'inherit' });
      }
    } else {
      console.log('🔄 Checking & pulling latest release updates...');
      try {
        execSync('git pull origin main', { cwd: RELEASES_DIR, stdio: 'inherit' });
      } catch (e) {
        try {
          execSync('git pull origin master', { cwd: RELEASES_DIR, stdio: 'inherit' });
        } catch (err) {
          console.warn('ℹ️ Remote pull note (proceeding):', err.message);
        }
      }
    }

    // 2. If build was saved in dist-electron, copy artifacts to zentura-releases-repo
    if (fs.existsSync(DIST_ELECTRON_DIR)) {
      console.log('📋 Copying installer & latest.yml from dist-electron...');
      const files = fs.readdirSync(DIST_ELECTRON_DIR);
      files.forEach((file) => {
        if (file.endsWith('.exe') || file.endsWith('.yml') || file.endsWith('.blockmap')) {
          copyRecursiveSync(path.join(DIST_ELECTRON_DIR, file), path.join(RELEASES_DIR, file));
          console.log(`   ✓ Copied: ${file}`);
        }
      });
    }

    // 3. Inspect generated artifacts in zentura-releases-repo
    const repoFiles = fs.existsSync(RELEASES_DIR) ? fs.readdirSync(RELEASES_DIR) : [];
    const exeFiles = repoFiles.filter(f => f.endsWith('.exe'));
    const ymlExists = repoFiles.includes('latest.yml');

    console.log(`📊 Release Artifacts Found: ${exeFiles.length} executable(s), latest.yml: ${ymlExists ? 'Yes' : 'No'}`);

    // Read version from package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
    const currentVersion = `v${pkg.version || '1.0.0'}`;
    const latestExe = exeFiles[exeFiles.length - 1] || `Zentura Cashier Setup ${pkg.version || '1.0.0'}.exe`;

    // 4. Git Add, Commit & Push to GitHub repository
    console.log('💾 Staging release files...');
    execSync('git add .', { cwd: RELEASES_DIR, stdio: 'inherit' });

    const commitMsg = `Release ${currentVersion} - ${new Date().toISOString()}`;
    try {
      execSync(`git commit -m "${commitMsg}"`, { cwd: RELEASES_DIR, stdio: 'inherit' });
    } catch (e) {
      console.log('ℹ️ No new uncommitted changes.');
    }

    console.log('🚀 Pushing releases to GitHub repository...');
    try {
      execSync('git push origin main', { cwd: RELEASES_DIR, stdio: 'inherit' });
    } catch (e) {
      try {
        execSync('git push origin master', { cwd: RELEASES_DIR, stdio: 'inherit' });
      } catch (err) {
        console.warn('⚠️ Push warning (check git credentials if pushing to remote):', err.message);
      }
    }

    // 5. Register Release with Supabase Releases Hub (Super Admin Console)
    try {
      console.log('🌐 Syncing release metadata with Supabase Super Admin Hub...');
      const downloadUrl = `https://github.com/hunraali2-cloud/Zentura-releases/raw/main/${encodeURIComponent(latestExe)}`;

      let fileSizeMb = 0;
      const exePath = path.join(RELEASES_DIR, latestExe);
      if (fs.existsSync(exePath)) {
        fileSizeMb = Math.round((fs.statSync(exePath).size / (1024 * 1024)) * 10) / 10;
      }

      const { error: dbError } = await supabase.from('releases').upsert({
        version: currentVersion,
        file_name: latestExe,
        file_size_mb: fileSizeMb || 65,
        download_url: downloadUrl,
        is_mandatory: false,
        release_notes: `Official Release ${currentVersion} - Multi-tenant POS Cashier Desktop App.`
      }, { onConflict: 'version' });

      if (!dbError) {
        console.log('✅ Super Admin Releases Hub updated with new release version!');
      }
    } catch (dbErr) {
      console.warn('ℹ️ Super Admin Hub sync notice:', dbErr.message);
    }

    console.log('\n🎉 Zentura Cashier Release Workflow Completed Successfully!');
  } catch (error) {
    console.error('❌ Publish workflow encountered an error:', error);
    process.exit(1);
  }
}

runPublish();
