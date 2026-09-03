#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

import { runBuild } from '../application/build'
import {
  CLI_USAGE,
  parseCliArguments,
} from '../application/cli-arguments'
import { loadApplicationConfig } from '../application/config'
import { runDevelop } from '../application/develop'
import { findApplicationRoot } from '../application/paths'
import { runTests } from '../application/run-tests'

export async function runCli(arguments_: readonly string[]): Promise<void> {
  const parsed = parseCliArguments(arguments_)
  const root = await findApplicationRoot(process.cwd())
  const config = await loadApplicationConfig(root)

  if (parsed.command === 'build') {
    await runBuild(config)
    return
  }

  if (parsed.command === 'develop') {
    await runDevelop(config, parsed.serverArguments)
    return
  }

  await runTests(config, parsed.project, parsed.watch)
}

const executablePath = process.argv[1]
if (executablePath && import.meta.url === pathToFileURL(executablePath).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    console.error(CLI_USAGE)
    process.exitCode = 1
  })
}
