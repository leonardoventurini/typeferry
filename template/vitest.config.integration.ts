import path from 'node:path'

import { babel } from '@rollup/plugin-babel'
import { withFilter } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    withFilter(
      babel({
        babelHelpers: 'bundled',
        babelrc: false,
        configFile: false,
        extensions: ['.ts', '.tsx'],
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
        ],
      }),
      { transform: { code: '@' } },
    ),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: [
      '{client,common,server,test}/**/*.integration.spec.ts',
      '{client,common,server,test}/**/*.integration.spec.tsx',
    ],
    setupFiles: ['test/setup-integration.ts'],
    testTimeout: 30_000,
  },
})
