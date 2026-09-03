export type TestProjectName = 'unit' | 'integration' | 'browser'

export type CliArguments =
  | { readonly command: 'build' }
  | { readonly command: 'develop'; readonly serverArguments: readonly string[] }
  | {
      readonly command: 'test'
      readonly project?: TestProjectName
      readonly testArguments: readonly string[]
      readonly watch: boolean
    }

const TEST_PROJECTS = new Set<TestProjectName>([
  'unit',
  'integration',
  'browser',
])

export const CLI_USAGE =
  'Usage: typeferry <develop [-- server-args...]|build|test [unit|integration|browser] [--watch] [-- vitest-args...]>'

export function parseCliArguments(arguments_: readonly string[]): CliArguments {
  const [command, ...rest] = arguments_

  if (command === 'build') {
    if (rest.length > 0) throw new Error(`Unexpected build arguments. ${CLI_USAGE}`)
    return { command }
  }

  if (command === 'develop') {
    if (rest.length === 0) return { command, serverArguments: [] }
    if (rest[0] !== '--') {
      throw new Error(`Server arguments must follow --. ${CLI_USAGE}`)
    }
    return { command, serverArguments: rest.slice(1) }
  }

  if (command === 'test') return parseTestArguments(rest)

  throw new Error(`Unknown command: ${command ?? '(missing)'}. ${CLI_USAGE}`)
}

function parseTestArguments(arguments_: readonly string[]): CliArguments {
  let project: TestProjectName | undefined
  let watch = false
  const separatorIndex = arguments_.indexOf('--')
  const typeFerryArguments =
    separatorIndex === -1 ? arguments_ : arguments_.slice(0, separatorIndex)
  const testArguments =
    separatorIndex === -1 ? [] : arguments_.slice(separatorIndex + 1)

  for (const argument of typeFerryArguments) {
    if (argument === '--watch') {
      watch = true
      continue
    }

    if (!TEST_PROJECTS.has(argument as TestProjectName)) {
      throw new Error(`Unknown test project: ${argument}. ${CLI_USAGE}`)
    }
    if (project !== undefined) {
      throw new Error(`Only one test project can be selected. ${CLI_USAGE}`)
    }
    project = argument as TestProjectName
  }

  return project === undefined
    ? { command: 'test', testArguments, watch }
    : { command: 'test', project, testArguments, watch }
}
