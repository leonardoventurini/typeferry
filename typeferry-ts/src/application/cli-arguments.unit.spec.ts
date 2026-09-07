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

describe('native simulator CLI arguments', () => {
  it.each(['add', 'sync', 'open'])('preserves native %s', action => {
    expect(parseCliArguments(['native', action, 'ios'])).toEqual({ command: 'native', action, target: 'ios' })
  })
  it.each(['devices', 'doctor'])('supports JSON for %s', action => {
    expect(parseCliArguments(['native', action, 'ios', '--json'])).toEqual({ command: 'native', action, target: 'ios', json: true })
    expect(parseCliArguments(['native', action, 'ios'])).toEqual({ command: 'native', action, target: 'ios', json: false })
  })
  it.each(['doctor', 'run', 'logs', 'screenshot'])('supports an exact device for %s', action => {
    expect(parseCliArguments(['native', action, 'ios', '--device', ' Example phone '])).toEqual({ command: 'native', action, target: 'ios', device: 'Example phone', ...(action === 'doctor' ? { json: false } : action === 'run' ? { headless: false } : {}) })
  })
  it('supports screenshot output and doctor option ordering', () => {
    expect(parseCliArguments(['native', 'screenshot', 'ios', '--output', ' ./image file.png ', '--device', 'device-id'])).toEqual({ command: 'native', action: 'screenshot', target: 'ios', output: './image file.png', device: 'device-id' })
    expect(parseCliArguments(['native', 'doctor', 'ios', '--device', 'device-id', '--json'])).toEqual({ command: 'native', action: 'doctor', target: 'ios', device: 'device-id', json: true })
  })
  it.each([
    ['run', 'ios', '--json'], ['devices', 'ios', '--device', 'phone'],
    ['run', 'ios', '--output', 'file'], ['sync', 'ios', '--json'],
    ['doctor', 'ios', '--json', '--json'], ['run', 'ios', '--device', 'a', '--device', 'b'],
    ['screenshot', 'ios', '--output', 'a', '--output', 'b'],
    ['run', 'ios', '--device'], ['run', 'ios', '--device', '--json'],
    ['run', 'ios', '--device', ' '], ['run', 'ios', '--device', 'a\0b'],
    ['screenshot', 'ios', '--output', ''], ['screenshot', 'ios', '--output', 'a\0b'],
    ['run', 'ios', '--unknown'], ['run', 'android'], ['unknown', 'ios'],
    ['logs', 'ios', 'extra'], ['run', 'ios', '--device=phone'],
  ])('rejects malformed native arguments: %j', (...args) => {
    expect(() => parseCliArguments(['native', ...args])).toThrow()
  })
})


describe('native headless run', () => {
  it('supports an explicit headless run without changing other actions', () => {
    expect(parseCliArguments(['native', 'run', 'ios', '--headless'])).toEqual({ command: 'native', action: 'run', target: 'ios', headless: true })
    expect(parseCliArguments(['native', 'run', 'ios'])).toEqual({ command: 'native', action: 'run', target: 'ios', headless: false })
    expect(() => parseCliArguments(['native', 'run', 'ios', '--headless', '--headless'])).toThrow()
    expect(() => parseCliArguments(['native', 'logs', 'ios', '--headless'])).toThrow()
  })
})
