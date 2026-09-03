import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  request as createHttpRequest,
  type ServerResponse,
} from "node:http";

import type { Plugin } from "vite";

import type { ResolvedDevelopmentProxyRoute } from "./config";

const COOKIE_DOMAIN_ATTRIBUTE_PATTERN = /;\s*Domain=[^;]*/giu;
const COOKIE_PATH_ATTRIBUTE_PATTERN = /;\s*Path=[^;]*/iu;
const COOKIE_SECURE_ATTRIBUTE_PATTERN = /;\s*Secure/giu;

export function findDevelopmentProxyRoute(
  url: string | undefined,
  routes: readonly ResolvedDevelopmentProxyRoute[],
): ResolvedDevelopmentProxyRoute | null {
  if (url === undefined) return null;

  const pathname = url.split("?", 1)[0];
  return (
    routes.find(
      (route) =>
        pathname === route.pathPrefix ||
        pathname?.startsWith(`${route.pathPrefix}/`) === true,
    ) ?? null
  );
}

export function createTypeFerryDevProxy(
  backendPort: number,
  routes: readonly ResolvedDevelopmentProxyRoute[],
): Plugin {
  return {
    name: "typeferry-development-proxy",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const route = findDevelopmentProxyRoute(request.url, routes);
        if (route === null) {
          next();
          return;
        }

        proxyRequest(request, response, backendPort, route);
      });
    },
  };
}

/** Removes backend-only cookie domains without adding undefined headers. */
export function rewriteProxyHeaders(
  proxyHeaders: IncomingHttpHeaders,
): IncomingHttpHeaders {
  const headers = { ...proxyHeaders };
  const setCookie = headers["set-cookie"];
  if (setCookie) {
    headers["set-cookie"] = setCookie.map((cookie) => {
      const normalizedCookie = cookie
        .replace(COOKIE_SECURE_ATTRIBUTE_PATTERN, "")
        .replace(COOKIE_DOMAIN_ATTRIBUTE_PATTERN, "");

      if (COOKIE_PATH_ATTRIBUTE_PATTERN.test(normalizedCookie)) {
        return normalizedCookie.replace(
          COOKIE_PATH_ATTRIBUTE_PATTERN,
          "; Path=/",
        );
      }

      return `${normalizedCookie}; Path=/`;
    });
  }
  return headers;
}

function proxyRequest(
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse,
  backendPort: number,
  route: ResolvedDevelopmentProxyRoute,
): void {
  const proxyRequest = createHttpRequest(
    {
      hostname: "127.0.0.1",
      port: backendPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: route.preserveHostHeader
        ? clientRequest.headers
        : { ...clientRequest.headers, host: `localhost:${backendPort}` },
    },
    (proxyResponse) => {
      const headers = route.rewriteLocalhostCookies
        ? rewriteProxyHeaders(proxyResponse.headers)
        : proxyResponse.headers;
      clientResponse.writeHead(proxyResponse.statusCode ?? 502, headers);
      proxyResponse.pipe(clientResponse);
    },
  );

  proxyRequest.on("error", (error: Error) => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { "content-type": "text/plain" });
    }
    clientResponse.end(`TypeFerry development proxy error: ${error.message}`);
  });
  clientRequest.on("aborted", () => proxyRequest.destroy());
  clientRequest.pipe(proxyRequest);
}
