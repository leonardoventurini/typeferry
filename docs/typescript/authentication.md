# Authentication

TypeFerry separates authentication from transport: the server resolves application identity, protected methods require it, and authorization remains application code.

## Configure the server

```ts
// server/auth.ts
import type { Server } from 'typeferry-ts/server'

const DEVELOPMENT_TOKEN = 'replace-this-development-token'

export function configureAuth(server: Server): void {
  server.setAuth({
    auth(context) {
      if (context.token !== DEVELOPMENT_TOKEN) return null

      return { user: { _id: 'local-user' } }
    },
    async logIn(input) {
      if (input.token !== DEVELOPMENT_TOKEN) return null

      return { token: DEVELOPMENT_TOKEN }
    },
  })
}
```

This fixed token is suitable only for a local example. In production, verify a short-lived credential using an application-owned identity provider, rotate signing keys, rate-limit login, and return no identity on malformed, expired, or unverifiable input. Authentication errors and timeouts must fail closed.

Add `token` to `allowedContextKeys` on the server and provide it through the client's `initialContext` only when this context-token model fits the application. Prefer secure, HTTP-only cookies where the deployment and auth helpers support them; never log secrets or place sensitive credentials in URLs.

## Protect and authorize

Use `@Protected()` to reject anonymous calls. Inside each protected method, verify tenant, role, and resource ownership using the authenticated `ClientNode`; being logged in does not imply access to every object.

The `typeferry-ts/auth` entry point provides JWT, session, cookie, device, and shared auth primitives. OAuth integrations are split into `typeferry-ts/auth/server/oauth` and `typeferry-ts/auth/client/oauth`. Treat OAuth state, redirect allowlists, PKCE, cookie flags, and provider secrets as part of the application's security boundary.

The template shows the integration seam in [`server/index.ts`](../../template/server/index.ts), not a production identity system.
