# iOS simulator CLI

## Problem and evidence

The native CLI currently supports add, sync and open only. Repeated simulator
work requires application scripts to coordinate Xcode, device selection, signing,
installation and diagnostics. Installed Xcode help confirms simctl supports JSON
device discovery, bootstatus, install, launch, logs and screenshots. Simulator
authentication requires preserved application entitlements; unsigned compilation
alone is insufficient validation.

## Contract and scope

Add `native devices|run|doctor|logs|screenshot ios`. Keep existing commands unchanged.
`devices` and `doctor` support `--json`; device-scoped commands accept `--device`
with a UDID or an unambiguous exact name. Configuration supplies optional
`client.targets.ios.xcode` (project or workspace, scheme, configuration,
derivedDataPath) and `simulator.device`. Paths resolve from the application root.
Defaults follow the generated Capacitor project, Debug configuration and an iOS
DerivedData subdirectory. No account, team, product, backend or credential defaults
belong in the framework. Custom project/workspace paths select the build
container; native sync still owns the conventional generated `ios/App` scaffold.
They do not relocate that scaffold.

Select an explicit CLI device before a configured device. Otherwise use a single
booted available iOS simulator, or the sole available iOS simulator. Ambiguity is
an actionable error listing candidates; never silently pick the first or use the
ambiguous `booted` simctl alias. Logs/screenshots require the selected device to be
booted. `run` builds/syncs current web assets, waits for that simulator to boot,
builds with ad-hoc simulator signing enabled, resolves the matching application's
product from Xcode build settings, installs without uninstalling, and launches it.
`run` opens Simulator.app after booting by default; `--headless` skips only
opening that GUI, retaining build/sync, boot/wait, install and launch. This differs
from `native open ios`, which opens Xcode. Preserve app-owned signing settings and data. No automatic device creation, erase,
certificate changes, provisioning updates, distribution or publication.

Use argument arrays without a shell. Stream long build/log output and propagate
failures and interruption. Screenshots write PNG to an explicit `--output` path or
a unique path beneath DerivedData; reject overwriting an existing file. Doctor
reports actionable read-only checks and returns failure when required checks fail.
Do not change web runtime, transport, auth, or wire behavior. Add no dependencies.

## Tests and acceptance

- [x] First add parser/config tests for compatible syntax, invalid options,
      project/workspace exclusion and optional configuration.
- [x] Procedural command fixtures cover unavailable/ambiguous devices, exact
      selection, platform failures, build ordering, signing flags, product identity,
      argument safety, screenshot overwrite and failed commands.
- [x] Check process streaming, failure and cancellation contracts.
- [x] Run focused tests, package lint/typecheck, all split suites, build, pack
      inspection and audit using the pinned package toolchain.
- [x] Validate compiled local package from a downstream repository without encoding
      downstream paths or tests in framework source/release tools.
- [x] Verify real simulator doctor/discovery/run/screenshot/log commands. Confirm
      installed app identity and entitlements; disclose UI or physical-device limits.
- [ ] Prepare an unoccupied minor release version, commit the verified changes,
      and request manual publication. Do not publish automatically.

## Executed verification

Package lint and typecheck, all split unit/integration/browser suites (1,692
passing tests), and five additional focused safety regressions passed: 1,697
tests in total. The updated focused safety suite passed all ten cases. The
`0.12.0` build, 506-file package artifact validation, generic consumer verification
and security audit passed; the audit reported zero vulnerabilities. Focused
command regressions cover backpressure, cancellation while a child output pipe
is paused, bounded streaming diagnostics and literal argument execution without
a shell.

A downstream application validated the compiled candidate using real simulator
devices, doctor, headless run, signed build, installation, launch, screenshot,
existing-output refusal and logs terminated with Ctrl-C/exit code 130. An invalid
device selector was rejected. The simulator app's embedded entitlement section
was confirmed and deep, strict codesign verification passed.

Normal Simulator GUI opening was covered by mocked orchestration, not exercised
in the real headless run. Physical-device behavior and distribution readiness
remain outside this verification. The unpublished release is `0.12.0`, following
published `0.11.0`; the candidate version is unoccupied in the registry and available for
publication. Publication remains manual; no upload has been performed.

## Risks and recovery

Xcode output includes extension/test products; resolve the application by its bundle
identifier, not array order or assumed product name. Duplicate simulator names exist
across runtimes. Full Xcode is required, while plain command-line tools are not enough.
Streaming processes must not accumulate unbounded logs. Doctor is diagnostic, not
proof of developer-program or production-signing readiness.

The downstream keeps its registry dependency until publication, using only a temporary
compiled local checkout for validation. Revert CLI/config additions to recover; no
migration or protocol change is involved. Existing native add/sync/open remain usable.

## Sources

- https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference
- https://developer.apple.com/library/archive/technotes/tn2339/_index.html
- Installed Xcode `xcrun simctl help` and `xcodebuild -help`.
