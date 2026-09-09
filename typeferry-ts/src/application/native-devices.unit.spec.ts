import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  type IosSimulator,
  parseIosSimulators,
  readIosSimulators,
  requireBootedSimulator,
  selectIosSimulator,
} from './native-devices.js'

const runtime = (version: number): string => `com.apple.CoreSimulator.SimRuntime.iOS-${version}-0`
const simulator = (overrides: Partial<IosSimulator> = {}): IosSimulator => ({
  udid: randomUUID(), name: 'Example Phone', state: 'Shutdown', runtime: runtime(26), isAvailable: true, ...overrides,
})
const response = (devices: readonly IosSimulator[]): unknown => {
  const grouped: Record<string, unknown[]> = {}
  for (const device of devices) {
    (grouped[device.runtime] ??= []).push({ ...device, dataPath: '/example/simulator', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.Example' })
  }
  return { devices: grouped }
}

describe('iOS simulator discovery', () => {
  it('projects only iOS devices while retaining unavailable devices and deterministic ordering', () => {
    const later = simulator({ name: 'Zulu', runtime: runtime(26) })
    const earlier = simulator({ name: 'Beta', runtime: runtime(18) })
    const unavailable = simulator({ name: 'Alpha', isAvailable: false })
    const television = simulator({ runtime: 'com.apple.CoreSimulator.SimRuntime.tvOS-26-0' })
    const output = parseIosSimulators(response([later, television, unavailable, earlier]))

    expect(output).toEqual([earlier, unavailable, later])
    expect(parseIosSimulators(response([earlier, unavailable, later, television]))).toEqual(output)
    expect(output[0]!).not.toHaveProperty('dataPath')
  })

  it('orders duplicate names by UDID without relying on incoming order', () => {
    const devices = Array.from({ length: 5 }, () => simulator())
    const expected = [...devices].sort((left, right) => left.udid < right.udid ? -1 : 1)
    expect(parseIosSimulators(response(devices))).toEqual(expected)
  })

  it.each([null, [], {}, { devices: [] }, { devices: { [runtime(26)]: {} } }])('rejects malformed device envelopes', value => {
    expect(() => parseIosSimulators(value)).toThrow(/Invalid.*simulator/i)
  })

  it.each([
    { udid: 'not-a-uuid' }, { name: '' }, { state: '' }, { isAvailable: 'true' }, { isAvailable: undefined },
  ])('rejects malformed simulator fields', invalid => {
    expect(() => parseIosSimulators({ devices: { [runtime(26)]: [{ ...simulator(), ...invalid }] } })).toThrow(/Invalid.*simulator/i)
  })

  it('reads JSON through the injected command runner without executing a shell', async () => {
    const device = simulator()
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(response([device])), stderr: '' })
    expect(await readIosSimulators(run)).toEqual([device])
    expect(run).toHaveBeenCalledExactlyOnceWith('xcrun', ['simctl', 'list', 'devices', '--json'])
  })

  it('rejects invalid JSON and preserves command failures', async () => {
    await expect(readIosSimulators(vi.fn().mockResolvedValue({ stdout: '{', stderr: '' }))).rejects.toThrow(/Invalid.*JSON/i)
    const failure = new Error('Xcode is unavailable')
    await expect(readIosSimulators(vi.fn().mockRejectedValue(failure))).rejects.toBe(failure)
  })
})

describe('iOS simulator selection', () => {
  it('selects an exact UDID case-insensitively ahead of matching device names', () => {
    const target = simulator()
    const named = simulator({ name: target.udid.toUpperCase() })
    expect(selectIosSimulator([named, target], target.udid.toUpperCase())).toBe(target)
  })

  it('requires an exact case-sensitive device name without aliases or substring matching', () => {
    const device = simulator({ name: 'Example Phone Pro' })
    expect(selectIosSimulator([device], device.name)).toBe(device)
    for (const selector of ['Example', device.name.toLowerCase(), 'booted', '']) {
      expect(() => selectIosSimulator([device], selector)).toThrow(device.udid)
    }
  })

  it('reports every ambiguous exact-name candidate with a usable UDID', () => {
    const devices = [simulator({ runtime: runtime(18) }), simulator()]
    for (const device of devices) expect(() => selectIosSimulator(devices, device.name)).toThrow(device.udid)
    expect(() => selectIosSimulator(devices, devices[0]!.name)).toThrow(/--device/)
  })

  it('prefers the sole available booted simulator and otherwise the sole available simulator', () => {
    const booted = simulator({ state: 'Booted' })
    const shutdown = simulator()
    const unavailable = simulator({ state: 'Booted', isAvailable: false })
    expect(selectIosSimulator([shutdown, booted, unavailable])).toBe(booted)
    expect(selectIosSimulator([shutdown, unavailable])).toBe(shutdown)
  })

  it('rejects ambiguous booted or shutdown collections instead of choosing the first', () => {
    for (const state of ['Booted', 'Shutdown']) {
      const devices = Array.from({ length: 2 }, () => simulator({ state }))
      for (const device of devices) expect(() => selectIosSimulator(devices)).toThrow(device.udid)
    }
  })

  it('never selects unavailable devices and gives discovery guidance for empty sets', () => {
    const unavailable = simulator({ isAvailable: false })
    expect(() => selectIosSimulator([unavailable], unavailable.udid)).toThrow(/unavailable/i)
    expect(() => selectIosSimulator([unavailable], unavailable.name)).toThrow(/unavailable/i)
    expect(() => selectIosSimulator([])).toThrow(/native devices ios/)
  })

  it('requires booted state for commands that cannot boot or mutate the selected device', () => {
    expect(() => requireBootedSimulator(simulator({ state: 'Booted' }))).not.toThrow()
    expect(() => requireBootedSimulator(simulator({ state: 'Booted', isAvailable: false }))).toThrow(/available/)
    expect(parseIosSimulators({ devices: {} })).toEqual([])
    const device = simulator()
    expect(() => requireBootedSimulator(device)).toThrow(device.udid)
    expect(() => requireBootedSimulator(device)).toThrow(/boot/i)
  })
})
