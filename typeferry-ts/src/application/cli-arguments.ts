export type TestProjectName = 'unit' | 'integration' | 'browser'

/**
 * Native actions carry only the options supported by their command.
 */
export type NativeCliArguments =
  | { readonly command: 'native'; readonly action: 'add' | 'sync' | 'open'; readonly target: 'ios' }
  | { readonly command: 'native'; readonly action: 'devices'; readonly target: 'ios'; readonly json: boolean }
  | { readonly command: 'native'; readonly action: 'doctor'; readonly target: 'ios'; readonly json: boolean; readonly device?: string }
  | { readonly command: 'native'; readonly action: 'run'; readonly target: 'ios'; readonly device?: string; readonly headless: boolean }
  | { readonly command: 'native'; readonly action: 'logs'; readonly target: 'ios'; readonly device?: string }
  | { readonly command: 'native'; readonly action: 'screenshot'; readonly target: 'ios'; readonly device?: string; readonly output?: string }

export type CliArguments =
  | { readonly command: 'build'; readonly target?: 'ios' }
  | NativeCliArguments
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
  'Usage: typeferry <develop [-- server-args...]|build [--target ios]|native <add|sync|open|devices|doctor|run|logs|screenshot> ios [--device name-or-UDID] [--json] [--output path] [--headless]|test [unit|integration|browser] [--watch] [-- vitest-args...]>'

export function parseCliArguments(arguments_: readonly string[]): CliArguments {
  const [command, ...rest] = arguments_

  if (command === 'native') return parseNativeArguments(rest)
  if (command === 'build') {
    if (rest.length === 2 && rest[0] === '--target' && rest[1] === 'ios') return { command, target: 'ios' }
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

function parseNativeArguments(arguments_: readonly string[]): NativeCliArguments {
  const [action, target, ...options] = arguments_
  const command = 'native'

  if (target !== 'ios') throw new Error(CLI_USAGE)
  if (action === 'add' || action === 'sync' || action === 'open') {
    if (options.length > 0) throw new Error(CLI_USAGE)
    return { command, action, target }
  }
  if (action !== 'devices' && action !== 'doctor' && action !== 'run' && action !== 'logs' && action !== 'screenshot') throw new Error(CLI_USAGE)

  let json = false
  let headless = false
  let device: string | undefined
  let output: string | undefined
  const seen = new Set<string>()

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    if (option === undefined || seen.has(option)) throw new Error(`Duplicate native option. ${CLI_USAGE}`)
    seen.add(option)
    if (option === '--headless' && action === 'run') {
      headless = true
      continue
    }
    if (option === '--json' && (action === 'devices' || action === 'doctor')) {
      json = true
      continue
    }
    if ((option === '--device' && action !== 'devices') || (option === '--output' && action === 'screenshot')) {
      const value = options[index + 1]?.trim()
      if (!value || value.startsWith('--') || value.includes('\0')) throw new Error(`Expected a value for ${option}. ${CLI_USAGE}`)
      if (option === '--device') device = value
      else output = value
      index += 1
      continue
    }
    throw new Error(`Unknown native option: ${option}. ${CLI_USAGE}`)
  }

  const selection = device === undefined ? {} : { device }
  if (action === 'run') return { command, action, target, headless, ...selection }
  if (action === 'devices') return { command, action, target, json }
  if (action === 'doctor') return { command, action, target, json, ...selection }
  if (action === 'screenshot') return { command, action, target, ...selection, ...(output === undefined ? {} : { output }) }
  return { command, action, target, ...selection }
}
