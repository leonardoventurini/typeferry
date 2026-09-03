import { describe, expect, it } from 'vitest'

import { parseCliArguments } from './cli-arguments'

describe('application CLI arguments', () => {
  it('parses the supported commands', () => {
    expect(parseCliArguments(['build'])).toEqual({ command: 'build' })
    expect(parseCliArguments(['test', 'browser', '--watch'])).toEqual({
      command: 'test',
      project: 'browser',
      watch: true,
    })
    expect(parseCliArguments(['develop', '--', '--seed'])).toEqual({
      command: 'develop',
      serverArguments: ['--seed'],
    })
  })

  it('rejects unknown commands and test projects', () => {
    expect(() => parseCliArguments(['lint'])).toThrow(/Unknown command/u)
    expect(() => parseCliArguments(['test', 'e2e'])).toThrow(
      /Unknown test project/u,
    )
  })
})
