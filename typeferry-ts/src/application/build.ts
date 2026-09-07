import { access, rm } from 'node:fs/promises'
import path from 'node:path'

import { build as buildServer } from 'esbuild'
import { build as buildClient } from 'vite'

import type { ApplicationTarget, ResolvedApplicationConfig } from './config'
import { createServerBuildOptions } from './server-build'
import { createViteConfig } from './vite-config'

export async function runBuild(
  config: ResolvedApplicationConfig,
  target: ApplicationTarget = 'web',
): Promise<void> {
  if (target === 'ios') {
    await buildClient(createViteConfig(config, 'build', target))
    await access(path.join(config.root, config.paths.output, 'ios-web', 'index.html'))
    await config.extensions.afterBuild?.({ target })
    return
  }
  await Promise.all([
    access(path.join(config.root, config.paths.client, 'index.html')),
    access(path.join(config.root, config.paths.server, 'index.ts')),
  ])

  await rm(path.join(config.root, config.paths.output), {
    force: true,
    recursive: true,
  })

  await Promise.all([
    buildClient(createViteConfig(config, 'build')),
    buildServer(createServerBuildOptions(config)),
  ])

  await config.extensions.afterBuild?.({ target })
}
