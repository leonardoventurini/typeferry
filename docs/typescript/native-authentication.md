# Native authentication integration

The optional native host retains the existing HTTP RPC wire protocol. Configure
`ClientOptions.backend.httpOrigin` (and optionally `webSocketOrigin`) when bundled
assets run from a local origin. Explicit origins override legacy host/port options.
`ClientOptions.httpFetch` selects a private native HTTP transport for cookie-bearing
RPC; ordinary browser clients continue using fetch and HttpOnly cookies unchanged.

```ts
import { Client } from 'typeferry/client'
import { createNativeHttpFetch } from 'typeferry/auth/client'
import { TypeFerryNative } from 'typeferry/native'

const httpFetch = createNativeHttpFetch(TypeFerryNative)
const client = new Client({
  backend: { httpOrigin: 'https://api.example.com' },
  httpFetch,
})
```

The native bridge pins the configured backend origin and rejects off-origin
redirects. Its cookie store remains native; refresh cookies are not returned to
JavaScript. The adapter supports textual RPC/auth bodies only. Use a separate,
authenticated binary media path for uploads and downloads. Cancellation checks
cannot undo a native HTTP operation already processed by the server.

## External browser sign-in

Native applications must not embed third-party OAuth login pages in their web
view. `authenticateNativeSession` opens the system authentication browser, validates
an exact registered callback and state, and exchanges a single-use PKCE S256 code
through the native HTTP transport. This establishes a new native refresh cookie
without copying the system browser's cookies.

The application registers two endpoints:

1. Authorization authenticates the browser user through the application's existing
   sign-in journey, validates `code_challenge_method=S256`, and calls
   `NativeAuthHandoff.authorize({ value, challenge, redirectUri, state })`. Its
   result is the native callback URL. Store only an authorized identity intent in
   `value`, never a refresh token. Redirect URIs must be explicitly registered.
2. Exchange accepts POST JSON `{ code, codeVerifier, redirectUri }`, calls
   `handoff.exchange({ code, verifier: codeVerifier, redirectUri })`, revalidates the
   resulting identity, creates a separate session and sets its refresh cookie.
   Return `{ token, exp, iat }`, with no refresh credential in the response body.

`NativeAuthGrantStore` is application-owned durable storage. `consume` must
atomically match the code hash, challenge, exact redirect URI and unexpired
`expiresAt`, then delete and return the matching value. Invalid attempts must not
consume another valid grant. Store grants across all server instances and purge
expired entries. Codes expire after two minutes and contain 256 random bits.

The application owns endpoint rate limits, browser authentication, identity
revalidation, session issuance/revocation and HTTP cache policy. Use `no-store`
on both endpoints and never log callback codes, verifiers or session credentials.

```ts
import { authenticateNativeSession } from 'typeferry/auth/client'

const session = await authenticateNativeSession({
  backendOrigin: 'https://api.example.com',
  authorizationPath: '/api/native/authorize',
  exchangePath: '/api/native/exchange',
  redirectUri: 'com.example.app://auth/callback',
  authenticate: options => TypeFerryNative.authenticate(options),
  httpFetch,
})

await client.setContextAndReInit({ ...session, _tokenReceivedAt: Date.now() })
```

Web OAuth and cookie defaults are unchanged. This application-level handoff does
not add a new TypeFerry protocol method or alter other language implementations.
Native authorization remains dependent on actual-device validation, including
cancelled sign-in, restart, expired credentials and app upgrades.

References: [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html),
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html).
