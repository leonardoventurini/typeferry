import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    conditions: ['module'],
    alias: {
      'bifrost/': path.resolve(__dirname, 'src') + '/',
    },
  },
})
