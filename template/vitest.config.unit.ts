import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: [
      'scripts/**/*.unit.spec.ts',
      '{client,common,server,test}/**/*.unit.spec.ts',
      '{client,common,server,test}/**/*.unit.spec.tsx',
    ],
    setupFiles: ['test/setup-unit.ts'],
  },
})
