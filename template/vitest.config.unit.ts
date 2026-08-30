import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: [
      'scripts/**/*.unit.spec.ts',
      'src/**/*.unit.spec.ts',
      'src/**/*.unit.spec.tsx',
    ],
    setupFiles: ['src/test/setup-unit.ts'],
  },
})
