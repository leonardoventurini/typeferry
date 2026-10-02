---
status: shipped
created: 2026-10-02
updated: 2026-10-02
---

# Preserve live connections during browser wake recovery

## Outcome and scope

The TypeScript client recovers from browser sleep without cancelling requests
on a responsive socket or replacing the same recovery connection twice.
This is a private lifecycle correction. Public APIs, wire messages, server
implementations, authentication policy, dependencies and persisted data remain
unchanged. Publication and downstream adoption belong to the operator.

## Evidence and uncertainty

Controlled clock/socket cases reproduce a healthy socket retired after a
90-second timer gap and a second replacement when visibility returns before
the first replacement initializes. The published 0.12 and 0.13 visibility and
socket implementations are identical; this is not a newly introduced 0.13
regression. A production stack identifies retirement, but cannot identify
the initiating browser event or the affected operation.

## Lifecycle contract

```text
wake evidence -> refresh hook -> live traffic within 30s -> retain socket
                             -> stale/changed token     -> replace once
                                                         -> initialized
close/destroy -------------------------------------------> cancel recovery
```

Timer gaps in hidden pages are deferred until visibility returns. For an open,
initialized socket, existing server traffic proves liveness within a bounded
30-second grace period; the protocol already requires a server ping every
25 seconds. A token change or exhausted refresh-hook retries still requires
replacement. A socket superseded during asynchronous recovery cannot be
retired by the old recovery. Existing connection/backoff work is joined through
initialization rather than restarted by another wake signal.

Recovery owns its timers and listeners until initialization, bounded failure,
or cancellation. Closing/destroying a client cancels pending hook backoff,
probe and initialization waits. Replacing a genuinely stale connection still
rejects pending RPCs; no mutations are replayed automatically and no errors
are suppressed by their message text.

## Acceptance criteria and planned verification

1. A delayed heartbeat preserves a responsive socket and its pending RPC;
   controlled transport tests deliver a real response during the grace period.
2. A silent open socket is replaced once after the bounded grace, and pending
   RPCs reject; real ClientSocket tests verify the lifecycle boundary.
3. Overlapping heartbeat/visibility signals do not replace a connection during
   its hook, probe or initialization; subsequent recovery remains possible.
4. Hidden timer delays cause no replacement until visibility returns.
5. Token changes and exhausted hook retries still recover authentication.
6. Close/destroy prevents late reconnects and releases owned waits/listeners.
7. The compiled package and archive pass the existing npm release gate.

## Risks and recovery

A silent but open socket can require up to 30 seconds to classify as stale.
Normal RPC timeouts remain unchanged. Delivered traffic may have been buffered before suspension; it is activity
evidence rather than a fresh round trip. Cancelling recovery cannot cancel
application-owned side effects inside a hook, but prevents late manager
reconnection. No server traffic is invented and no protocol extension is
required. Rollback uses the prior published package;
there are no migrations. Actual OS suspension, native hardware, publication
and production/downstream adoption are outside local release verification.

## Verification results

All seven acceptance criteria passed local verification. Publication and
production/downstream adoption remain operator-owned; this specification's
shipped status records the verified source implementation, not an npm upload.

| Criterion | Executed evidence |
| --- | --- |
| 1: Preserve live requests | Real Client/ClientSocket grace tests retain pending RPCs; real-server long-hide call also preserves socket identity. |
| 2: Recover silent sockets | Grace expiration replaces once and rejects pending acknowledgements. |
| 3: Share recovery | Hook/probe/CONNECTING/auth overlaps, initialization timeout, delayed subscriptions and later recovery cases pass. |
| 4: Defer hidden gaps | Hidden heartbeat test performs no hook/replacement until visible. |
| 5: Keep authentication correct | Hook failure/timeout, token changes during grace, old-token successor and current-token successor cases pass. |
| 6: Cancel pending work | Close/destroy during hook, retry and grace remove listeners/timers and prevent late replacement. |
| 7: Release surface | Complete npm gate, compiled output and 565-file archive validation pass. |

Executed from the repository root: `just verify-npm-release`, including
`npm ci`, lint, strict typecheck, all split suites, build, packed application
consumer smoke and package archive validation. The suites passed 1,687 unit
cases, 77 integration cases and 10 browser cases. Three explicit opt-in Ruby
interoperability cases were skipped. Temporary MongoDB/Redis containers were
removed by the gate; pre-existing services were untouched.

Focused pre-gate checks: 27 new actual-client recovery cases, 18 existing
manager cases and 35 real-server tab-sleep cases passed. The initial 12-case
regression set failed against the unmodified runtime before implementation.
`npm audit --audit-level=low` reported zero vulnerabilities. The public registry
check confirmed `0.13.1` is an available new version.

Non-blocking existing warnings: deprecated stub typings during immutable
install, and deprecated `node-domexception` plus unapproved optional install
scripts in the temporary packed-consumer fixture. Consumer build/runtime smoke
still passed; no dependency or install policy was changed.

Built `dist/client/visibility-manager.js` SHA-256:
`ba685747d36dd62baa09e0a09b433a885ecf23e6c1b3c08704d0d7ae80b31f06`.
Implementation is committed with the semantic subject
`fix(client): preserve live sockets and deduplicate browser wake recovery`.
No OS suspension, physical native device, npm publication or downstream
production deployment was executed. No plan deviation or migration is required.
