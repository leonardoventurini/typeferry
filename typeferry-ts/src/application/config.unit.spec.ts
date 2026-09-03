import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPLICATION_CONFIG,
  defineConfig,
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
});
