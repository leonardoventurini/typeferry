import { startVitest } from 'vitest/node'

import type { TestProjectName } from './cli-arguments'
import type { ResolvedApplicationConfig } from './config'
import { createTestConfig } from './test-config'

export async function runTests(
  config: ResolvedApplicationConfig,
  project: TestProjectName | undefined,
  watch: boolean,
): Promise<void> {
  const vitest = await startVitest(
    'test',
    [],
    {
      project: project === undefined ? undefined : [project],
      root: config.root,
      run: !watch,
      watch,
    },
    createTestConfig(config),
  )

  if (!watch) await vitest.close()
}
