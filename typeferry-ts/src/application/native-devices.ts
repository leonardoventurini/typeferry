import { z } from 'zod'

import type { NativeCommandRunner } from './native-command.js'

/**
 * Simulator discovery data independent of application identity or signing.
 */
export interface IosSimulator {
  readonly udid: string
  readonly name: string
  readonly state: string
  readonly runtime: string
  readonly isAvailable: boolean
}

const IOS_RUNTIME = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-\d+(?:-\d+)*$/
const BOOTED_STATE = 'Booted'
const DISCOVERY_COMMAND = 'typeferry native devices ios'
const simulatorSchema = z.object({
  udid: z.uuid(),
  name: z.string().min(1),
  state: z.string().min(1),
  isAvailable: z.boolean(),
})
const simulatorListSchema = z.object({
  devices: z.record(z.string(), z.array(simulatorSchema)),
})

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSimulators(left: IosSimulator, right: IosSimulator): number {
  return compareText(left.runtime, right.runtime)
    || compareText(left.name, right.name)
    || compareText(left.udid, right.udid)
}

/**
 * Validates consumed simctl fields and discards Apple metadata such as local
 * filesystem paths. Non-iOS runtimes are excluded, unavailable iOS devices are
 * retained for diagnostics, and output order does not depend on JSON key order.
 */
export function parseIosSimulators(value: unknown): readonly IosSimulator[] {
  const parsed = simulatorListSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Invalid iOS simulator device data from xcrun simctl. Check that a supported Xcode installation is selected.')
  }

  return Object.entries(parsed.data.devices)
    .filter(([runtime]) => IOS_RUNTIME.test(runtime))
    .flatMap(([runtime, devices]) => devices.map(device => ({ ...device, runtime })))
    .sort(compareSimulators)
}

/**
 * Executes read-only device discovery through the supplied command boundary.
 */
export async function readIosSimulators(run: NativeCommandRunner): Promise<readonly IosSimulator[]> {
  const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', '--json'])
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new Error('Invalid JSON from xcrun simctl device discovery. Check that a supported Xcode installation is selected.')
  }
  return parseIosSimulators(value)
}

function describeCandidates(devices: readonly IosSimulator[]): string {
  return [...devices].sort(compareSimulators).map(device =>
    `  ${device.udid}  ${JSON.stringify(device.name)}  ${device.runtime}  ${JSON.stringify(device.state)}`,
  ).join('\n')
}

function selectUnique(devices: readonly IosSimulator[]): IosSimulator {
  if (devices.length === 1 && devices[0]) return devices[0]
  throw new Error(`Multiple iOS simulators match. Choose an exact UDID with --device:\n${describeCandidates(devices)}`)
}

function selectExplicit(devices: readonly IosSimulator[], selector: string): IosSimulator {
  const byUdid = devices.filter(device => device.udid.toLowerCase() === selector.toLowerCase())
  const matches = byUdid.length ? byUdid : devices.filter(device => device.name === selector)
  const availableMatches = matches.filter(device => device.isAvailable)
  if (availableMatches.length) return selectUnique(availableMatches)
  if (matches.length) {
    throw new Error(`The selected iOS simulator is unavailable. Install its runtime or choose another device with ${DISCOVERY_COMMAND}:\n${describeCandidates(matches)}`)
  }

  const available = devices.filter(device => device.isAvailable)
  throw new Error(`No available iOS simulator matches ${JSON.stringify(selector)}. Run ${DISCOVERY_COMMAND} and select an exact name or UDID with --device.${available.length ? `\n${describeCandidates(available)}` : ''}`)
}

/**
 * Honors explicit identity before defaults. Duplicate names or multiple booted
 * devices require a human choice; callers always receive a concrete UDID and
 * must never pass simctl's ambiguous "booted" alias.
 */
export function selectIosSimulator(devices: readonly IosSimulator[], selector?: string): IosSimulator {
  if (selector !== undefined) return selectExplicit(devices, selector)
  const available = devices.filter(device => device.isAvailable)
  if (!available.length) {
    throw new Error(`No available iOS simulators. Run ${DISCOVERY_COMMAND} and install an iOS simulator runtime in Xcode if needed.`)
  }
  const booted = available.filter(device => device.state === BOOTED_STATE)
  return selectUnique(booted.length ? booted : available)
}

/**
 * Read-only diagnostics cannot implicitly boot or otherwise change a device.
 */
export function requireBootedSimulator(device: IosSimulator): void {
  if (device.isAvailable && device.state === BOOTED_STATE) return
  throw new Error(`iOS simulator ${device.udid} (${JSON.stringify(device.name)}) must be available and booted. Boot this device before requesting logs or a screenshot.`)
}
