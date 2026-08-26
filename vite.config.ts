import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': {}
  },
  resolve: {
    alias: {
      '@zentura/escpos-engine': path.resolve(__dirname, './packages/escpos-engine/src/index.ts'),
      '@zentura/database': path.resolve(__dirname, './packages/database/src/index.ts')
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
