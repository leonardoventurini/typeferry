import { runNative } from '../application/native'
import { runNativeSimulator } from '../application/native-simulator'
import { runBuild } from '../application/build'
import { parseCliArguments } from '../application/cli-arguments'
import { loadApplicationConfig } from '../application/config'
import { runDevelop } from '../application/develop'
import { findApplicationRoot } from '../application/paths'
import { runTests } from '../application/run-tests'

export async function runCli(arguments_: readonly string[]): Promise<void> {
  const parsed = parseCliArguments(arguments_)
  const root = await findApplicationRoot(process.cwd())
  const config = await loadApplicationConfig(root)

  if (parsed.command === 'build') {
    await runBuild(config, parsed.target)
    return
  }

  if (parsed.command === 'native') {
    switch (parsed.action) {
      case 'devices':
      case 'doctor':
      case 'run':
      case 'logs':
      case 'screenshot':
        if (!await runNativeSimulator(config, parsed)) process.exitCode = 1
        break
      default:
        await runNative(config, parsed.action)
    }
    return
  }

  if (parsed.command === 'develop') {
    await runDevelop(config, parsed.serverArguments)
    return
  }

  await runTests(config, parsed.project, parsed.watch, parsed.testArguments)
}
