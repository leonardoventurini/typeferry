import path from 'node:path'

import type { BuildOptions } from 'esbuild'

import type { ResolvedApplicationConfig } from './config'

export function createServerBuildOptions(
  config: ResolvedApplicationConfig,
): BuildOptions {
  return {
    bundle: true,
    entryPoints: [
      path.join(config.root, config.paths.server, 'index.ts'),
    ],
    format: 'cjs',
    outfile: path.join(
      config.root,
      config.paths.output,
      'server',
      'index.cjs',
    ),
    platform: 'node',
    sourcemap: config.build.sourceMaps,
    supported: { decorators: false },
    target: config.build.target,
  }
}
