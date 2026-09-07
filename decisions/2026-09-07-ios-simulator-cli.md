# Generic iOS simulator CLI

## Context

The optional iOS application target already owns bundled client compilation and
Capacitor scaffolding. Consumers otherwise repeat Xcode and simctl orchestration,
including device ambiguity handling and entitlement-preserving simulator signing.
The user approved a reusable framework CLI and typed application configuration.

## Decision

Add `native devices|doctor|run|logs|screenshot ios` beside the existing native
commands. Configure optional Xcode project or workspace, scheme, configuration,
DerivedData path and default simulator through `client.targets.ios`. Resolve
paths from the application root and keep the generated scaffold at `ios/App`.

Explicit CLI selection overrides configuration. Match UDIDs or exact names;
without a selector, require a unique available booted device or a sole available
device. Report candidate identifiers when selection is ambiguous. Never guess
the first device or pass the ambiguous `booted` alias to simctl.

Every run rebuilds and syncs current bundled assets, boots and waits for the
selected device, compiles with ad-hoc signing, identifies the application product
by bundle identifier and simulator platform, installs without uninstalling and
launches. Open Simulator.app by default; `--headless` suppresses only that GUI
step. Keep `native open ios` as the existing Xcode-opening workflow.

Logs and screenshots require an already booted device. Screenshots default to
unique PNG paths beneath DerivedData and reject overwrites. Discovery and doctor
support JSON output. Doctor diagnoses local prerequisites without repairing the
environment or establishing developer-account/distribution readiness.

Subprocesses use literal argument arrays, bounded diagnostic capture and output
backpressure. Cancellation releases paused pipes and terminates the child process
group so interrupted streams do not leave a blocked workflow behind.

## Alternatives and rationale

Consumer-specific scripts duplicate these contracts and let device-selection and
signing behavior drift. Disabling signing entirely would undermine simulator
validation of entitlement-dependent behavior. Silently choosing a booted device
would make commands nondeterministic with multiple simulators. Reusing stale
assets would make successful launch an unreliable check of current application
source. These approaches were rejected.

## Consequences and recovery

No dependencies, protocol changes, data migrations, account defaults, credentials
or distribution automation are introduced. Existing app signing settings,
entitlements and installed data remain app-owned. Custom build containers may
reference the standard scaffold; arbitrary scaffold relocation is unsupported.

The unpublished candidate is `0.12.0`, following registry release `0.11.0`.
Publication remains manual; no upload has been performed and the candidate
version is available for publication. Automated verification passed 1,692 tests
in the complete split suites plus five final safety regressions (1,697 total),
the `0.12.0` build, 506-file package artifact validation, generic consumer
verification and an audit with zero vulnerabilities.

Real compiled downstream checks passed discovery, doctor, headless run, signed
build, installation, launch, screenshot, existing-output refusal and log
cancellation with exit code 130. Invalid device selection was rejected. The
simulator app's embedded entitlement section was confirmed and deep, strict
codesign verification passed. Normal GUI opening remains verified through mocked
orchestration only. Physical-device and distribution validation remain distinct
from simulator CLI acceptance.

Rollback removes the new CLI/configuration surfaces without migrating app data;
existing native add/sync/open commands remain available. See the
[implementation spec](../specs/2026-09-07-ios-simulator-cli.md) and
[iOS application guide](../docs/typescript/ios-applications.md).
