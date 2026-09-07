# iOS applications

TypeFerry can build an existing React client into a bundled Capacitor iOS app.
Native integration is opt-in; ordinary web builds do not import Capacitor.

```ts
export default defineConfig({
  application: { id: 'com.example.app', name: 'Example' },
  client: { targets: { ios: {
    runtime: 'capacitor',
    backend: { origin: 'https://example.com' },
    permissions: {
      camera: { purpose: 'Show your camera preview.' },
      microphone: { purpose: 'Include sound in your recording.' },
    },
  } } },
})
```

Install `@capacitor/core` and `@capacitor/ios` in the application and
`@capacitor/cli` as a development dependency using npm. Version 8 is the
validated integration line. Xcode and an iOS simulator are required for native
compilation; signing and physical-device testing belong to the application.
Audit application dependencies after installation.

From the application root:

```sh
npm exec -- typeferry build --target ios
npm exec -- typeferry native add ios
npm exec -- typeferry native sync ios
npm exec -- typeferry native open ios
```

The normal `typeferry build` still builds web and server outputs. The iOS target
builds only client assets into `dist/ios-web/index.html`; no server code or
server environment is copied. Vite extensions receive `{ command, target }`;
`afterBuild` receives `{ target }`. Guard web/server-only hooks appropriately.
Keep the native output directory isolated and use the client root entry.

Native commands generate `capacitor.config.json`, register a TypeFerry Swift
bridge in the conventional Capacitor App target, and add permission descriptions
and the application-id callback scheme. The generated Swift and configuration
have hash ownership records in `.typeferry/generated`. Ignore this local ledger
in Git. Existing modified generated files are rejected instead of overwritten;
review upstream template changes and reconcile intentionally. App-owned signing,
assets, native files, and existing URL schemes remain intact. Existing custom
Capacitor configurations/controllers require explicit integration.

`typeferry/application/runtime` exports `getApplicationRuntime()` and
`resolveBackendUrl(path)`. Only public target/backend metadata is embedded. Do
not import the Node configuration module into browser code. Configure
`ClientOptions.backend` and `httpFetch` with the native adapter; see
[native authentication](native-authentication.md). Explicit native origins do
not grant authorization: application endpoints must still authenticate requests.

`typeferry/native` is the optional bridge entry point. It exposes native
lifecycle, private cookie HTTP, browser auth, file sharing, and
`acquireNativeWakeLock()`. Release each wake lease when reading ends; native
leases keep the screen awake only while the app is foregrounded and are cleaned
up on navigation or bridge destruction. Media capture is
permitted only from the bundled main frame and after the OS authorization. No
permission is requested merely by configuring it. External content must not
navigate inside the privileged webview. Native logging is disabled to avoid
logging RPC/auth bridge payloads.

The application must disable its PWA service worker/update reload logic for the
iOS target and react to native background events. A native bundle is released
with the app binary; downloadable web updates are not implemented. Retest
camera, microphone, interruptions, and permission persistence on physical iOS
hardware before claiming those behaviors verified.
