import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.unit.spec.ts', 'src/**/*.unit.spec.tsx'],
    testTimeout: 10000,
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/index.ts',
        'src/test/**',
        'src/**/types.ts',
        'src/server/request-types.ts',
        'src/server/decorators/infer.ts',
      ],
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    conditions: ['module'],
    alias: {
      'typeferry/': path.resolve(__dirname, 'src') + '/',
    },
  },
})
