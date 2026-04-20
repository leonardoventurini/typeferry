import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
    },
    include: ['src/**/*.browser.spec.ts', 'src/**/*.browser.spec.tsx'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    teardownTimeout: 5000,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@example-app/bifrost/':
        path.resolve(__dirname, 'node_modules/@example-app/bifrost/src') + '/',
    },
  },
})
