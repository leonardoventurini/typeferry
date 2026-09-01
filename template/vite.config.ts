import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

import { typeferryDevProxy } from './scripts/vite-dev-proxy.ts'

export default defineConfig({
  root: 'client',
  plugins: [typeferryDevProxy(), react(), tailwindcss()],
  server: {
    allowedHosts: true,
    watch: {
      ignored: ['**/*.spec.ts', '**/*.spec.tsx'],
    },
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      react: path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
      '@': path.resolve(import.meta.dirname),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'client/index.html'),
    },
  },
})
