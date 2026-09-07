# iOS hybrid application support

## Problem and evidence
TypeFerry owns client/server builds and transports but assumes a browser origin and builds both outputs together. An application needs its existing React bundle packaged in Capacitor, native media permission ownership, and authenticated access to its existing backend. Current build hooks have no target context. User approved the complete iOS vertical slice and a local consumer validation before manual publication.

## Scope and contracts
- Add validated optional iOS application configuration and isolated client build target; preserve default web build behavior.
- Package only public client configuration and assets. Never bundle server environment or secrets.
- Provide explicit HTTP/WebSocket backend origins with backward-compatible defaults.
- Scaffold Capacitor without overwriting app-owned native code/signing. Publish native support as an optional entry point.
- Authenticate through supported native/browser handoff and secure session handling; preserve authorization and protocol defaults.
- Scope media permission handling to trusted bundled content, respect OS grants/revocation, and request capture only on user action.
- Provide lifecycle and file-sharing adapters. The application owns product UI, identity, backend address and usage descriptions.
- No Android, live-update delivery, native recorder rewrite, automatic publication, or physical-device acceptance claim.

## Risks, uncertainty and recovery
Local-origin cookies/OAuth and WKWebView behavior require integration validation. Native compilation and simulator checks cannot establish real camera recording or permission persistence. User explicitly accepts those checks pending. Keep browser contracts intact; revert task commits to recover. Generated files are isolated and native customization is preserved. No installed package patch or source aliases; validate built local package exports then leave publication to the user.

## Executable checklist
- [ ] Config/build/CLI unit tests for target separation, invalid config, public runtime config and output paths.
- [ ] Transport/auth regressions for explicit origins and session handoff.
- [ ] Native adapters and permission contracts tested; Swift compiled with Xcode.
- [ ] Local package installed into a downstream application; affected tests, lint/typecheck and web/iOS builds verified.
- [ ] Upstream lint, typecheck, split suites, build, pack inspection and audit.
- [ ] Document API and update architecture/decision/release records.
- [ ] Commit verified units, bump unpublished minor candidate, provide manual publication handoff.

## Direct rollout
Build upstream, temporarily consume compiled local package in the downstream application, iterate, then prepare version for operator publication. Registry consumer installation/final consumer completion happens only after the user confirms publication. No push or publish is authorized.
