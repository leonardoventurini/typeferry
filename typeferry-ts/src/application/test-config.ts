import { existsSync } from 'node:fs'
import path from 'node:path'

import { babel } from '@rollup/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import type {} from 'vitest/config'
import type { InlineConfig } from 'vite'

import type { ResolvedApplicationConfig } from './config'

export type ApplicationTestConfig = InlineConfig

export function createTestConfig(
  config: ResolvedApplicationConfig,
): ApplicationTestConfig {
  const alias = { '@': config.root }
  const projectRoots = '{client,common,server,test}'

  return {
    configFile: false,
    root: config.root,
    resolve: { alias },
    test: {
      projects: [
        {
          resolve: { alias },
          test: {
            name: 'unit',
            include: [
              `${projectRoots}/**/*.unit.spec.ts`,
              `${projectRoots}/**/*.unit.spec.tsx`,
            ],
            setupFiles: optionalSetup(config.root, 'setup-unit.ts'),
          },
        },
        {
          plugins: [
            babel({
              babelHelpers: 'bundled',
              babelrc: false,
              configFile: false,
              extensions: ['.ts', '.tsx'],
              plugins: [
                [
                  '@babel/plugin-proposal-decorators',
                  { version: '2023-11' },
                ],
              ],
            }),
          ],
          resolve: { alias },
          test: {
            name: 'integration',
            fileParallelism: false,
            hookTimeout: config.test.integration.timeout,
            include: [
              `${projectRoots}/**/*.integration.spec.ts`,
              `${projectRoots}/**/*.integration.spec.tsx`,
            ],
            setupFiles: optionalSetup(config.root, 'setup-integration.ts'),
            testTimeout: config.test.integration.timeout,
          },
        },
        {
          plugins: [react(), tailwindcss()],
          resolve: {
            alias: {
              ...alias,
              react: path.join(config.root, 'node_modules', 'react'),
              'react-dom': path.join(config.root, 'node_modules', 'react-dom'),
            },
          },
          test: {
            name: 'browser',
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: config.test.browser.browser }],
              provider: playwright(),
              screenshotFailures: false,
            },
            include: [
              `${projectRoots}/**/*.browser.spec.ts`,
              `${projectRoots}/**/*.browser.spec.tsx`,
            ],
            setupFiles: optionalSetup(config.root, 'setup-browser.ts'),
          },
        },
      ],
    },
  }
}

function optionalSetup(root: string, fileName: string): string[] {
  const setupPath = path.join(root, 'test', fileName)
  return existsSync(setupPath) ? [setupPath] : []
}
