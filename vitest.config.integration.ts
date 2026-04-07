import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    conditions: ['module'],
    alias: {
      '@example-app/bifrost/': path.resolve(__dirname, 'src') + '/',
    },
  },
})
