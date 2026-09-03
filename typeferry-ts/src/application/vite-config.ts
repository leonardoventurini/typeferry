import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { InlineConfig, PluginOption } from 'vite'

import type { ResolvedApplicationConfig } from './config'
import { createTypeFerryDevProxy } from './proxy'

export function createViteConfig(
  config: ResolvedApplicationConfig,
  command: 'develop' | 'build',
): InlineConfig {
  const plugins: PluginOption[] = [react(), tailwindcss()]
  if (command === 'develop') {
    plugins.unshift(createTypeFerryDevProxy(config.development.serverPort))
  }

  return {
    configFile: false,
    root: path.join(config.root, config.paths.client),
    plugins,
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: config.development.clientPort,
      hmr: { overlay: true },
      watch: {
        ignored: ['**/*.spec.ts', '**/*.spec.tsx'],
      },
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        react: path.join(config.root, 'node_modules', 'react'),
        'react-dom': path.join(config.root, 'node_modules', 'react-dom'),
        '@': config.root,
      },
    },
    build: {
      outDir: path.relative(
        path.join(config.root, config.paths.client),
        path.join(config.root, config.paths.output, 'client'),
      ),
      emptyOutDir: true,
      manifest: true,
      target: config.build.target,
      sourcemap: config.build.sourceMaps,
      rollupOptions: {
        input: path.join(config.root, config.paths.client, 'index.html'),
      },
    },
  }
}
