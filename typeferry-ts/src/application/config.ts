import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { createJiti } from "jiti";
import type { BuildOptions } from "esbuild";
import type { InlineConfig } from "vite";
import type {
  TestProjectConfiguration,
  ViteUserConfig as VitestConfig,
} from "vitest/config";
import { z } from "zod";

export type BrowserName = "chromium" | "firefox" | "webkit";
export type ApplicationTestConfig = VitestConfig;
export type ApplicationTestProjectConfiguration = TestProjectConfiguration;

export interface DevelopmentProxyRoute {
  readonly pathPrefix: string;
  readonly preserveHostHeader?: boolean;
  readonly rewriteLocalhostCookies?: boolean;
}

export interface ResolvedDevelopmentProxyRoute {
  readonly pathPrefix: string;
  readonly preserveHostHeader: boolean;
  readonly rewriteLocalhostCookies: boolean;
}

export interface ApplicationToolingExtensions {
  readonly vite?: (
    config: InlineConfig,
    context: { readonly command: "develop" | "build" },
  ) => InlineConfig;
  readonly serverBuild?: (options: BuildOptions) => BuildOptions;
  readonly test?: (config: VitestConfig) => VitestConfig;
  readonly afterBuild?: () => void | Promise<void>;
}

export interface TypeFerryConfig {
  readonly extensions?: ApplicationToolingExtensions;
  readonly development?: {
    readonly clientPort?: number;
    readonly serverPort?: number;
    readonly serverEnvironmentFile?: string;
    readonly proxyRoutes?: readonly DevelopmentProxyRoute[];
  };
  readonly build?: {
    readonly target?: string;
    readonly sourceMaps?: boolean;
    readonly server?: {
      readonly external?: readonly string[];
    };
  };
  readonly test?: {
    readonly integration?: {
      readonly timeout?: number;
    };
    readonly browser?: {
      readonly browser?: BrowserName;
    };
  };
}

export interface ResolvedApplicationConfig {
  readonly root: string;
  readonly paths: {
    readonly client: string;
    readonly common: string;
    readonly server: string;
    readonly tests: string;
    readonly output: string;
  };
  readonly development: {
    readonly clientPort: number;
    readonly serverPort: number;
    readonly serverEnvironmentFile: string;
    readonly proxyRoutes: readonly ResolvedDevelopmentProxyRoute[];
  };
  readonly build: {
    readonly target: string;
    readonly sourceMaps: boolean;
    readonly server: {
      readonly external: readonly string[];
    };
  };
  readonly test: {
    readonly integration: {
      readonly timeout: number;
    };
    readonly browser: {
      readonly browser: BrowserName;
    };
  };
  readonly extensions: ApplicationToolingExtensions;
}

const browserNameSchema = z.enum(["chromium", "firefox", "webkit"]);
const positivePortSchema = z.number().int().min(1).max(65_535);
const packageManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});
const serverExternalSchema = z
  .array(
    z
      .string()
      .min(1)
      .refine(isPackageSpecifier, "Expected an npm package specifier"),
  )
  .refine((values) => new Set(values).size === values.length, {
    message: "Server external package specifiers must not contain duplicates",
  });
const proxyPathPrefixSchema = z.string().regex(/^\/(?!$)[^?#]*[^/]$/u, {
  error:
    "pathPrefix must be a non-root path without a query, fragment, or trailing slash",
});
const proxyRouteSchema = z
  .object({
    pathPrefix: proxyPathPrefixSchema,
    preserveHostHeader: z.boolean().optional(),
    rewriteLocalhostCookies: z.boolean().optional(),
  })
  .strict();
const extensionsSchema = z
  .object({
    vite: z.function().optional(),
    serverBuild: z.function().optional(),
    test: z.function().optional(),
    afterBuild: z.function().optional(),
  })
  .strict();
const configSchema = z
  .object({
    extensions: extensionsSchema.optional(),
    development: z
      .object({
        clientPort: positivePortSchema.optional(),
        serverPort: positivePortSchema.optional(),
        serverEnvironmentFile: z.string().min(1).optional(),
        proxyRoutes: z.array(proxyRouteSchema).optional(),
      })
      .strict()
      .optional(),
    build: z
      .object({
        target: z.string().min(1).optional(),
        sourceMaps: z.boolean().optional(),
        server: z
          .object({ external: serverExternalSchema.optional() })
          .strict()
          .optional(),
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
  .strict();

export const DEFAULT_APPLICATION_CONFIG = {
  paths: {
    client: "client",
    common: "common",
    server: "server",
    tests: "test",
    output: "dist",
  },
  development: {
    clientPort: 8000,
    serverPort: 8002,
    serverEnvironmentFile: ".env.server",
    proxyRoutes: [
      {
        pathPrefix: "/.well-known",
        preserveHostHeader: true,
        rewriteLocalhostCookies: false,
      },
      {
        pathPrefix: "/mcp",
        preserveHostHeader: true,
        rewriteLocalhostCookies: false,
      },
      {
        pathPrefix: "/oauth",
        preserveHostHeader: true,
        rewriteLocalhostCookies: false,
      },
      {
        pathPrefix: "/__h",
        preserveHostHeader: true,
        rewriteLocalhostCookies: true,
      },
    ],
  },
  build: {
    target: "es2023",
    sourceMaps: true,
    server: {
      external: [] as readonly string[],
    },
  },
  test: {
    integration: { timeout: 30_000 },
    browser: { browser: "chromium" as BrowserName },
  },
  extensions: {},
} as const;

/** Provides contextual typing without transforming application configuration. */
export function defineConfig(config: TypeFerryConfig): TypeFerryConfig {
  return config;
}

export function resolveApplicationConfig(
  root: string,
  input: unknown = {},
): ResolvedApplicationConfig {
  const config = configSchema.parse(input) as TypeFerryConfig;

  return {
    root: path.resolve(root),
    paths: DEFAULT_APPLICATION_CONFIG.paths,
    development: {
      ...DEFAULT_APPLICATION_CONFIG.development,
      ...config.development,
      proxyRoutes: [
        ...DEFAULT_APPLICATION_CONFIG.development.proxyRoutes,
        ...(config.development?.proxyRoutes ?? []).map((route) => ({
          preserveHostHeader: false,
          rewriteLocalhostCookies: false,
          ...route,
        })),
      ],
    },
    build: {
      ...DEFAULT_APPLICATION_CONFIG.build,
      ...config.build,
      server: {
        ...DEFAULT_APPLICATION_CONFIG.build.server,
        ...config.build?.server,
      },
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
    extensions: config.extensions ?? {},
  };
}

export async function loadApplicationConfig(
  root: string,
): Promise<ResolvedApplicationConfig> {
  const configPath = path.join(root, "typeferry.config.ts");

  try {
    await access(configPath);
  } catch {
    return resolveApplicationConfig(root, withEnvironmentFile({}));
  }

  const jiti = createJiti(import.meta.url, {
    alias: { "@": root },
    interopDefault: true,
  });
  const loaded: unknown = await jiti.import(configPath, { default: true });
  const parsed = configSchema.parse(loaded) as TypeFerryConfig;
  const resolved = resolveApplicationConfig(root, withEnvironmentFile(parsed));
  await validateServerExternalDependencies(resolved);
  return resolved;
}

async function validateServerExternalDependencies(
  config: ResolvedApplicationConfig,
): Promise<void> {
  if (config.build.server.external.length === 0) return;

  const manifestPath = path.join(config.root, "package.json");
  const manifest = packageManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );

  for (const external of config.build.server.external) {
    const packageName = packageNameFromSpecifier(external);
    if (manifest.dependencies?.[packageName] !== undefined) continue;

    if (manifest.devDependencies?.[packageName] !== undefined) {
      throw new Error(
        `Server external "${external}" must be declared in dependencies, not devDependencies`,
      );
    }

    throw new Error(
      `Server external "${external}" must be declared in package.json dependencies`,
    );
  }
}

function isPackageSpecifier(value: string): boolean {
  if (value.includes("*") || value.includes("\\") || value.includes(":")) {
    return false;
  }

  const segments = value.split("/");
  if (value.startsWith("@")) {
    return (
      segments.length >= 2 &&
      isPackageNameSegment(segments[0]?.slice(1) ?? "") &&
      segments.every((segment, index) =>
        index === 0 ? true : isPackageNameSegment(segment),
      )
    );
  }

  return segments.every(isPackageNameSegment);
}

function isPackageNameSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9._~-]*$/u.test(value);
}

function packageNameFromSpecifier(specifier: string): string {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? `${segments[0]}/${segments[1]}`
    : (segments[0] ?? specifier);
}

function withEnvironmentFile(config: TypeFerryConfig): TypeFerryConfig {
  if (
    config.development?.serverEnvironmentFile !== undefined ||
    process.env["DEVELOP_ENV_FILE"] === undefined
  ) {
    return config;
  }

  return {
    ...config,
    development: {
      ...config.development,
      serverEnvironmentFile: process.env["DEVELOP_ENV_FILE"],
    },
  };
}
