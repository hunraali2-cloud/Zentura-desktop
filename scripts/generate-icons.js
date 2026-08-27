import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_IMAGE = 'C:/Users/Talal Sajid/.gemini/antigravity/brain/5ea731c6-d517-4575-ada3-5b3e6b74e668/.user_uploaded/media_1787815943195.png';

const DESKTOP_PUBLIC = path.resolve(__dirname, '../public');
const WEB_PUBLIC = path.resolve(__dirname, '../../Zentura Web/public');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createIcoFromPng(pngBuffer) {
  // Minimal valid ICO wrapper for PNG image
  // ICO header: 2 bytes reserved (0), 2 bytes type (1 = icon), 2 bytes count (1)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  // Directory entry (16 bytes):
  // width, height, colors, reserved, planes (1), bpp (32), size (4 bytes), offset (4 bytes = 6 + 16 = 22)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // 0 means 256 or variable width
  entry.writeUInt8(0, 1); // 0 means 256 or variable height
  entry.writeUInt8(0, 2); // 0 colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(22, 12); // image offset (6 + 16)

  return Buffer.concat([header, entry, pngBuffer]);
}

export function setupIcons() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.warn('Source image not found:', SOURCE_IMAGE);
    return;
  }

  ensureDir(DESKTOP_PUBLIC);
  ensureDir(WEB_PUBLIC);

  const pngBuffer = fs.readFileSync(SOURCE_IMAGE);
  const icoBuffer = createIcoFromPng(pngBuffer);

  // Desktop paths
  fs.writeFileSync(path.join(DESKTOP_PUBLIC, 'zentura-logo.png'), pngBuffer);
  fs.writeFileSync(path.join(DESKTOP_PUBLIC, 'zentura-logo.ico'), icoBuffer);
  fs.writeFileSync(path.join(DESKTOP_PUBLIC, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(DESKTOP_PUBLIC, 'icon.png'), pngBuffer);

  // Web paths
  fs.writeFileSync(path.join(WEB_PUBLIC, 'zentura-logo.png'), pngBuffer);
  fs.writeFileSync(path.join(WEB_PUBLIC, 'zentura-logo.ico'), icoBuffer);
  fs.writeFileSync(path.join(WEB_PUBLIC, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(WEB_PUBLIC, 'icon.png'), pngBuffer);

  console.log('✅ Custom Zentura Logo and ICO files generated successfully in Desktop and Web public folders!');
}

if (process.argv[1] === __filename) {
  setupIcons();
}
