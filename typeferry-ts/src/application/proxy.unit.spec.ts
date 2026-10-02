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

  it("selects application routes only on their configured hostnames", () => {
    const { development } = resolveApplicationConfig("/workspace/application", {
      development: { proxyRoutes: [{
        pathPrefix: "/blog",
        hostnames: ["showcase.localhost"],
        preserveHostHeader: true,
      }] },
    });

    for (const host of ["showcase.localhost:8000", "SHOWCASE.localhost:8000", "showcase.localhost.:8000"]) {
      expect(findDevelopmentProxyRoute("/blog/article?preview=1", development.proxyRoutes, host))
        .toMatchObject({ pathPrefix: "/blog", preserveHostHeader: true });
    }
    for (const host of [undefined, "localhost:8000", "showcase.localhost.evil:8000", "evil@showcase.localhost", "showcase.localhost/path"]) {
      expect(findDevelopmentProxyRoute("/blog/article", development.proxyRoutes, host)).toBeNull();
    }
    expect(findDevelopmentProxyRoute("/blogger", development.proxyRoutes, "showcase.localhost:8000")).toBeNull();
    expect(findDevelopmentProxyRoute("/__h", development.proxyRoutes, "localhost:8000")).not.toBeNull();
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
