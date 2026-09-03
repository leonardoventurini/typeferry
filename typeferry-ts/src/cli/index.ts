#!/usr/bin/env node

import {
  CLI_USAGE,
} from '../application/cli-arguments'
import { runCli } from './run'

runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  console.error(CLI_USAGE)
  process.exitCode = 1
})
