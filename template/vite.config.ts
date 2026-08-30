import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

import { bifrostDevProxy } from './scripts/vite-dev-proxy.ts'

export default defineConfig({
  root: 'src/client',
  plugins: [bifrostDevProxy(), react(), tailwindcss()],
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
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'src/client/index.html'),
    },
  },
})
