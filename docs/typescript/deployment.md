# Deployment

Deploy the TypeScript server as a Node.js application that owns one HTTP listener for health, HTTP RPC, WebSocket upgrades, and—when desired—static assets.

## Build contract

Applications consume TypeFerry's compiled ESM package exports. Do not point bundlers or TypeScript aliases at package source. The framework build is verified from `typeferry-ts/` with:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Applications install TypeFerry from npm. The [template](../../template/README.md)
builds and tests against the published package rather than the repository source
tree.

For conventional applications, `typeferry build` owns the client and server
compilation and produces `dist/client/` plus `dist/server/index.cjs`. See the
[application framework guide](application-framework.md) for the build contract;
production startup and infrastructure remain application-owned.

## Production checklist

- Terminate TLS at the application or a proxy that supports WebSocket upgrades.
- Forward the client IP/protocol headers only through trusted proxies and configure origins explicitly.
- Inject database, Redis, OAuth, signing, and session secrets at runtime.
- Replace sample authentication and enforce authorization on every protected resource.
- Expose readiness that checks critical dependencies; use graceful shutdown for the HTTP server, clients, database, and observers.
- Use Redis event propagation when clients connected to different replicas must share events.
- Keep sticky sessions only if application state truly requires them; prefer shared external state.
- Set request, body, idle, auth, and shutdown timeouts appropriate to the environment.

The template's production build writes a Vite client and bundled Node server, serves them from one process, includes `/healthz`, and provides a multi-stage non-root container. Review its [production instructions](../../template/README.md#production-build) as an application example, not a universal deployment prescription.
