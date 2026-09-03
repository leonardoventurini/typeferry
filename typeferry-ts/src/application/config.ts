import { access } from 'node:fs/promises'
import path from 'node:path'

import { createJiti } from 'jiti'
import { z } from 'zod'

export type BrowserName = 'chromium' | 'firefox' | 'webkit'

export interface TypeFerryConfig {
  readonly development?: {
    readonly clientPort?: number
    readonly serverPort?: number
    readonly serverEnvironmentFile?: string
  }
  readonly build?: {
    readonly target?: string
    readonly sourceMaps?: boolean
  }
  readonly test?: {
    readonly integration?: {
      readonly timeout?: number
    }
    readonly browser?: {
      readonly browser?: BrowserName
    }
  }
}

export interface ResolvedApplicationConfig {
  readonly root: string
  readonly paths: {
    readonly client: string
    readonly common: string
    readonly server: string
    readonly tests: string
    readonly output: string
  }
  readonly development: {
    readonly clientPort: number
    readonly serverPort: number
    readonly serverEnvironmentFile: string
  }
  readonly build: {
    readonly target: string
    readonly sourceMaps: boolean
  }
  readonly test: {
    readonly integration: {
      readonly timeout: number
    }
    readonly browser: {
      readonly browser: BrowserName
    }
  }
}

const browserNameSchema = z.enum(['chromium', 'firefox', 'webkit'])
const positivePortSchema = z.number().int().min(1).max(65_535)
const configSchema = z
  .object({
    development: z
      .object({
        clientPort: positivePortSchema.optional(),
        serverPort: positivePortSchema.optional(),
        serverEnvironmentFile: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    build: z
      .object({
        target: z.string().min(1).optional(),
        sourceMaps: z.boolean().optional(),
      })
      .strict()
      .optional(),
    test: z
      .object({
        integration: z
          .object({ timeout: z.number().int().positive().optional() })
          .strict()
          .optional(),
        browser: z
          .object({ browser: browserNameSchema.optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const DEFAULT_APPLICATION_CONFIG = {
  paths: {
    client: 'client',
    common: 'common',
    server: 'server',
    tests: 'test',
    output: 'dist',
  },
  development: {
    clientPort: 8000,
    serverPort: 8002,
    serverEnvironmentFile: '.env.server',
  },
  build: {
    target: 'es2023',
    sourceMaps: true,
  },
  test: {
    integration: { timeout: 30_000 },
    browser: { browser: 'chromium' as BrowserName },
  },
} as const

/** Provides contextual typing without transforming application configuration. */
export function defineConfig(config: TypeFerryConfig): TypeFerryConfig {
  return config
}

export function resolveApplicationConfig(
  root: string,
  input: unknown = {},
): ResolvedApplicationConfig {
  const config = configSchema.parse(input)

  return {
    root: path.resolve(root),
    paths: DEFAULT_APPLICATION_CONFIG.paths,
    development: {
      ...DEFAULT_APPLICATION_CONFIG.development,
      ...config.development,
    },
    build: {
      ...DEFAULT_APPLICATION_CONFIG.build,
      ...config.build,
    },
    test: {
      integration: {
        ...DEFAULT_APPLICATION_CONFIG.test.integration,
        ...config.test?.integration,
      },
      browser: {
        ...DEFAULT_APPLICATION_CONFIG.test.browser,
        ...config.test?.browser,
      },
    },
  }
}

export async function loadApplicationConfig(
  root: string,
): Promise<ResolvedApplicationConfig> {
  const configPath = path.join(root, 'typeferry.config.ts')

  try {
    await access(configPath)
  } catch {
    return resolveApplicationConfig(root)
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true })
  const loaded: unknown = await jiti.import(configPath, { default: true })
  return resolveApplicationConfig(root, loaded)
}
