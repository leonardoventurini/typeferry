import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.integration.spec.ts', 'src/**/*.test.tsx'],
    testTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    conditions: ['module'],
    alias: {
      'typeferry-ts/': path.resolve(__dirname, 'src') + '/',
    },
  },
})
