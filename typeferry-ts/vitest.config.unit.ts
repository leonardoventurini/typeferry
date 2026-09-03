import path from 'path'

import { babel } from '@rollup/plugin-babel'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    babel({
      babelHelpers: 'bundled',
      babelrc: false,
      configFile: false,
      extensions: ['.ts', '.tsx'],
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
      ],
    }),
  ],
  test: {
    include: ['src/**/*.unit.spec.ts', 'src/**/*.unit.spec.tsx'],
    testTimeout: 10000,
    fileParallelism: false,
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
      'typeferry/': path.resolve(import.meta.dirname, 'src') + '/',
    },
  },
})
