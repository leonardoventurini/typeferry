import { describe, expect, it } from 'vitest'

import { parseCliArguments } from './cli-arguments'

describe('application CLI arguments', () => {
  it('parses the supported commands', () => {
    expect(parseCliArguments(['build'])).toEqual({ command: 'build' })
    expect(parseCliArguments(['test', 'browser', '--watch'])).toEqual({
      command: 'test',
      project: 'browser',
      testArguments: [],
      watch: true,
    })
    expect(
      parseCliArguments([
        'test',
        'unit',
        '--',
        'server/example.unit.spec.ts',
        '--testNamePattern=example',
      ]),
    ).toEqual({
      command: 'test',
      project: 'unit',
      testArguments: [
        'server/example.unit.spec.ts',
        '--testNamePattern=example',
      ],
      watch: false,
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
    expect(() => parseCliArguments(['test', '--', '--watch'])).not.toThrow()
  })
})
