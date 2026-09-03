import { describe, expect, it } from "vitest";

import { findDevelopmentProxyRoute, rewriteProxyHeaders } from "./proxy";
import { resolveApplicationConfig } from "./config";

describe("TypeFerry development proxy", () => {
  it("matches the framework routes at path-segment boundaries", () => {
    const { development } = resolveApplicationConfig("/workspace/application");

    expect(
      findDevelopmentProxyRoute("/__h", development.proxyRoutes),
    ).toMatchObject({
      pathPrefix: "/__h",
      preserveHostHeader: true,
      rewriteLocalhostCookies: true,
    });
    expect(
      findDevelopmentProxyRoute(
        "/oauth/authorize?client=test",
        development.proxyRoutes,
      ),
    ).toMatchObject({ pathPrefix: "/oauth" });
    expect(
      findDevelopmentProxyRoute("/mcp-tools", development.proxyRoutes),
    ).toBeNull();
    expect(
      findDevelopmentProxyRoute("/apiary", development.proxyRoutes),
    ).toBeNull();
    expect(
      findDevelopmentProxyRoute("/healthz", development.proxyRoutes),
    ).toBeNull();
  });

  it("includes typed application-owned routes", () => {
    const { development } = resolveApplicationConfig("/workspace/application", {
      development: {
        proxyRoutes: [
          { pathPrefix: "/api" },
          { pathPrefix: "/board", preserveHostHeader: true },
        ],
      },
    });

    expect(
      findDevelopmentProxyRoute("/api/files", development.proxyRoutes),
    ).toMatchObject({
      pathPrefix: "/api",
      preserveHostHeader: false,
      rewriteLocalhostCookies: false,
    });
    expect(
      findDevelopmentProxyRoute("/board/asset", development.proxyRoutes),
    ).toMatchObject({
      pathPrefix: "/board",
      preserveHostHeader: true,
    });
  });

  it("normalizes backend cookies for the browser-facing localhost origin", () => {
    expect(
      rewriteProxyHeaders({
        "set-cookie": [
          "session=value; Domain=localhost; Path=/__h; Secure; HttpOnly",
        ],
      }),
    ).toEqual({
      "set-cookie": ["session=value; Path=/; HttpOnly"],
    });
  });
});
