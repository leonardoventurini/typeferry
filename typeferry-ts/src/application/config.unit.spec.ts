import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_APPLICATION_CONFIG,
  defineConfig,
  loadApplicationConfig,
  resolveApplicationConfig,
} from "./config";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("application configuration", () => {
  it("uses conventional defaults without a configuration file", () => {
    expect(resolveApplicationConfig("/workspace/application")).toEqual({
      ...DEFAULT_APPLICATION_CONFIG,
      root: "/workspace/application",
    });
  });

  it("accepts typed high-level overrides", () => {
    const configured = defineConfig({
      development: {
        clientPort: 4100,
        serverPort: 4200,
        serverEnvironmentFile: ".env.local",
        proxyRoutes: [{ pathPrefix: "/api" }],
      },
      build: {
        target: "es2024",
        sourceMaps: false,
        server: {
          external: ["sharp", "@scope/runtime/subpath"],
        },
      },
      test: {
        integration: { timeout: 45_000 },
        browser: { browser: "firefox" },
      },
    });

    expect(
      resolveApplicationConfig("/workspace/application", configured),
    ).toMatchObject({
      development: {
        clientPort: 4100,
        serverPort: 4200,
        serverEnvironmentFile: ".env.local",
        proxyRoutes: expect.arrayContaining([
          expect.objectContaining({ pathPrefix: "/__h" }),
          expect.objectContaining({ pathPrefix: "/api" }),
        ]),
      },
      build: {
        target: "es2024",
        sourceMaps: false,
        server: {
          external: ["sharp", "@scope/runtime/subpath"],
        },
      },
      test: {
        integration: { timeout: 45_000 },
        browser: { browser: "firefox" },
      },
    });
  });

  it("rejects unsupported configuration fields", () => {
    expect(() =>
      resolveApplicationConfig("/workspace/application", {
        vite: { server: { port: 4100 } },
      }),
    ).toThrow(/vite/u);
  });

  it.each([
    [[""], /too_small|external/u],
    [["sharp", "sharp"], /duplicate|external/u],
    [["./sharp"], /package specifier/u],
    [["/sharp"], /package specifier/u],
    [["sharp*"], /package specifier/u],
    [["@scope"], /package specifier/u],
  ])("rejects invalid server externals: %j", (external, expected) => {
    expect(() =>
      resolveApplicationConfig("/workspace/application", {
        build: { server: { external } },
      }),
    ).toThrow(expected);
  });

  it("accepts externals declared as direct production dependencies", async () => {
    const root = await writeApplication({
      dependencies: { sharp: "1.0.0", "@scope/runtime": "1.0.0" },
      devDependencies: {},
    });

    await writeFile(
      path.join(root, "typeferry.config.ts"),
      "export default { build: { server: { external: ['sharp', '@scope/runtime/subpath'] } } }\n",
    );

    await expect(loadApplicationConfig(root)).resolves.toMatchObject({
      build: {
        server: { external: ["sharp", "@scope/runtime/subpath"] },
      },
    });
  });

  it.each([
    [
      { dependencies: {}, devDependencies: { sharp: "1.0.0" } },
      /devDependencies/u,
    ],
    [{ dependencies: {}, devDependencies: {} }, /dependencies/u],
  ])(
    "rejects externals outside direct production dependencies",
    async (manifest, expected) => {
      const root = await writeApplication(manifest);

      await writeFile(
        path.join(root, "typeferry.config.ts"),
        "export default { build: { server: { external: ['sharp'] } } }\n",
      );

      await expect(loadApplicationConfig(root)).rejects.toThrow(expected);
    },
  );

  it("rejects unsafe development proxy prefixes", () => {
    expect(() =>
      resolveApplicationConfig("/workspace/application", {
        development: { proxyRoutes: [{ pathPrefix: "/" }] },
      }),
    ).toThrow(/pathPrefix/u);

    expect(() =>
      resolveApplicationConfig("/workspace/application", {
        development: { proxyRoutes: [{ pathPrefix: "/api?admin=true" }] },
      }),
    ).toThrow(/pathPrefix/u);
  });

  it("preserves application tooling extension callbacks", () => {
    const afterBuild = async (): Promise<void> => undefined;
    const vite = (config: unknown): unknown => config;
    const resolved = resolveApplicationConfig("/workspace/application", {
      extensions: { afterBuild, vite },
    });

    expect(resolved.extensions.afterBuild).toBeTypeOf("function");
    expect(resolved.extensions.vite?.({}, { command: "build" })).toEqual({});
  });

  it("loads application configuration with the root alias", async () => {
    const root = await writeApplication({
      dependencies: {},
      devDependencies: {},
    });
    await mkdir(path.join(root, "common"));
    await writeFile(
      path.join(root, "common", "ports.ts"),
      "export const CLIENT_PORT = 4100\n",
    );
    await writeFile(
      path.join(root, "typeferry.config.ts"),
      "import { CLIENT_PORT } from '@/common/ports'\nexport default { development: { clientPort: CLIENT_PORT } }\n",
    );

    await expect(loadApplicationConfig(root)).resolves.toMatchObject({
      development: { clientPort: 4100 },
    });
  });
});

async function writeApplication(manifest: {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "typeferry-config-"));
  temporaryRoots.push(root);
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", ...manifest }),
  );
  return root;
}
