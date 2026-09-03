import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPLICATION_CONFIG,
  defineConfig,
  loadApplicationConfig,
  resolveApplicationConfig,
} from "./config";

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
    const root = await mkdtemp(path.join(os.tmpdir(), "typeferry-config-"));

    try {
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
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
