# iOS applications

TypeFerry can build an existing React client into a bundled Capacitor iOS app.
Native integration is opt-in; ordinary web builds do not import Capacitor.

```ts
export default defineConfig({
  application: { id: 'com.example.app', name: 'Example' },
  client: { targets: { ios: {
    runtime: 'capacitor',
    backend: { origin: 'https://example.com' },
    xcode: {
      project: 'ios/App/App.xcodeproj',
      scheme: 'App',
      configuration: 'Debug',
      derivedDataPath: 'ios/DerivedData/Simulator',
    },
    // Optional: choose an exact installed device name or its UDID.
    simulator: { device: 'iPhone 17' },
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

Native `add` and `sync` generate `capacitor.config.json`, register a TypeFerry Swift
bridge in the conventional Capacitor App target, and add permission descriptions
and the application-id callback scheme. The generated Swift and configuration
have hash ownership records in `.typeferry/generated`. Ignore this local ledger
in Git. Existing modified generated files are rejected instead of overwritten;
review upstream template changes and reconcile intentionally. App-owned signing,
assets, native files, and existing URL schemes remain intact. Existing custom
Capacitor configurations/controllers require explicit integration.

## Simulator workflow

After the initial build and `native add ios`, run these commands from the
application root:

```sh
npm exec -- typeferry native devices ios
npm exec -- typeferry native devices ios --json
npm exec -- typeferry native doctor ios --device "iPhone 17" --json
npm exec -- typeferry native run ios --device "iPhone 17"
npm exec -- typeferry native run ios --device "iPhone 17" --headless
npm exec -- typeferry native logs ios --device "iPhone 17"
npm exec -- typeferry native screenshot ios --device "iPhone 17" --output ./artifacts/preview.png
```

Use a device name reported by `devices` on your machine; the example name is
not a framework default. The five commands have these responsibilities:

| Command | Behavior | Options |
|---|---|---|
| `native devices ios` | List iOS simulators, including unavailable devices, with names, UDIDs, runtime and state | `--json` |
| `native doctor ios` | Check local Xcode, simulator SDK/tools, configuration, device selection, Xcode container and scheme | `--device`, `--json` |
| `native run ios` | Rebuild the bundled client, sync native sources/assets, boot and wait for the selected simulator, build, install and launch the app | `--device`, `--headless` |
| `native logs ios` | Stream application logs from the selected booted simulator until interrupted | `--device` |
| `native screenshot ios` | Save a PNG from the selected booted simulator | `--device`, `--output` |

`run` always rebuilds and syncs before installing, so it cannot silently launch
an earlier web bundle. By default it opens Simulator.app after booting the
device. `--headless` skips opening that GUI while retaining the boot, build,
install and launch steps. `native open ios` opens Xcode; it does not perform
this build-and-run workflow. Installation preserves the existing app and its
data: the command does not uninstall, erase or create simulators.

Device selection uses `--device` before `client.targets.ios.simulator.device`.
A selector matches an available simulator's UDID case-insensitively, otherwise
its exact, case-sensitive name. Duplicate names require a UDID. Without either
selector, TypeFerry selects the unique available booted device, otherwise the
sole available device. Ambiguous or missing selections fail with candidate
UDIDs; it never selects the first device or interprets `booted` as an alias.
`logs` and `screenshot` require the selected device to be booted and do not boot
it implicitly.

A screenshot without `--output` receives a unique filename under the configured
DerivedData directory. Explicit output paths resolve from the application root.
Existing output files are never overwritten. Device and doctor JSON output is
intended for scripts. A failed required doctor check produces a nonzero exit;
its report is read-only and does not boot, build, install, repair signing, or
prove paid developer-account or distribution readiness.

The typed `client.targets.ios.xcode` settings are optional. Defaults are the
project, scheme, configuration and DerivedData path shown above. Use `workspace`
instead of `project` to build a workspace; setting both is invalid. Paths resolve
relative to the application root. A custom build container can reference the
standard generated project, but native sync still owns the conventional
`ios/App` scaffold. These fields do not relocate that scaffold or automatically
integrate an arbitrary native application.

Simulator builds use ad-hoc signing while retaining the project's signing
settings and entitlements. TypeFerry selects the application product by the
configured bundle identifier and simulator platform, rather than guessing the
first build product. These commands do not configure accounts, certificates or
provisioning, archive distribution builds, upload to TestFlight, or publish
anything. Physical-device signing and release workflows remain app-owned.

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
