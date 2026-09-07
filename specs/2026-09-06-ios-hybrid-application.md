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
- [x] Config/build/CLI unit tests for target separation, invalid config, public runtime config and output paths.
- [x] Transport/auth regressions for explicit origins and session handoff.
- [x] Native adapters and permission contracts tested; Swift compiled with Xcode.
- [x] Local package installed into a downstream application; affected tests, lint/typecheck and web/iOS builds verified.
- [x] Upstream lint, typecheck, split suites, build, pack inspection and audit.
- [x] Document API and update architecture/decision/release records.
- [x] Commit verified units, bump unpublished minor candidate, provide manual publication handoff.

## Direct rollout
Build upstream, temporarily consume compiled local package in the downstream application, iterate, then prepare version for operator publication. Registry consumer installation/final consumer completion happens only after the user confirms publication. No push or publish is authorized.

## Verification evidence
Package unit, integration and browser suites passed (1,526 unit tests at the
full-suite checkpoint; subsequent focused configuration/runtime/native tests
also passed). Integration: 51 tests; browser: 9 tests. Final native suite: 11
tests, including executable Swift checks. Lint, typecheck, build, npm artifact
validation and audit passed. Local compiled tarball consumer checks preserved
web authentication and completed both build targets. A simulator build/launch
and an ad-hoc signed generic fixture checked real Keychain persistence, private
cookies after restart, foreign-origin rejection, file cancellation, background
lifecycle, delayed-response logout protection and wake leases. Physical capture,
permission retention across binary upgrades and production OAuth remain pending.

Capacitor's modern SceneDelegate and unavailable WKWebView browser wake locks
required native registration and idle-timer lease support within the approved
slice. Temporary fixture signing used no Apple account. Version 0.11.0 is prepared
for manual publication; registry consumer adoption remains a subsequent step.
