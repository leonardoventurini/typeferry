import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      react: path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
    },
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
      provider: playwright(),
      screenshotFailures: false,
    },
    include: [
      '{client,common,server,test}/**/*.browser.spec.ts',
      '{client,common,server,test}/**/*.browser.spec.tsx',
    ],
    setupFiles: ['test/setup-browser.ts'],
  },
})
