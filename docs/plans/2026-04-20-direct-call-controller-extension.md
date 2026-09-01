# DirectCallController TypeFerry Extension Implementation Plan

> [!IMPORTANT]
> Historical and non-normative. This plan records prior implementation intent and may contain completed, superseded, or stale steps. Do not execute it as current instructions. Use `PROTOCOL.md`, the nearest `AGENTS.md`, accepted decisions, current source, and tests as authorities.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` by default to implement this plan task-by-task. If delegation is unavailable, continue in the current session with the same checklist, risk, and verification discipline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a framework-level DirectCallController extension to TypeFerry so apps can build reliable one-to-one audio/video calls without hand-rolling WebRTC signaling, negotiation, and UI adapter state.

**Architecture:** Put the reliability-critical call engine in `typeferry-ts/src/calls/` as a framework-neutral TypeScript controller with explicit state transitions, typed signaling envelopes, WebRTC negotiation, diagnostics, and cleanup ownership. Keep React as a thin adapter over the same controller, and keep server helpers generic enough that applications provide their own authorization, session persistence, and recipient resolution.

**Tech Stack:** TypeScript, TypeFerry `Client`, TypeFerry channels/events, React hooks, browser WebRTC APIs, Zod schemas for optional server helpers, Vitest unit/integration/browser runners.

**Delegation Strategy:** Start with one Cortex-first explorer if the implementer has not recently touched TypeFerry internals; the deliverable is a 1-page map of client/channel/server/react extension points. Then split work into core types/state machine, WebRTC peer engine, TypeFerry signaling transport, server helper, React adapter, diagnostics, tests, exports, and docs. Do not parallelize edits that touch the same files; parallelize only adapter tests and docs after the core interfaces are stable.

---

## Problem Statement

ExampleApp's current direct chat call flow lives inside an application React hook. That made it fast to ship, but it put protocol correctness, WebRTC lifecycle, UI state, and application routing in one place. The result is fragile: initial offers can depend on `onnegotiationneeded`, remote tracks can arrive on the same `MediaStream` object without a UI update, connection state can report `disconnected` temporarily, and each product that wants calls would need to rediscover the same edge cases.

TypeFerry is the correct home for the reusable layer because it already owns:

- authenticated client identity and context
- RPC calls through `Client.call`
- channel subscription and event propagation
- React hooks in `typeferry-ts/src/react`
- server decorators and runtime authorization hooks

TypeFerry should not own application-specific friend lists, conversations, or UI. The extension should own call mechanics and provide typed seams where the app supplies domain policy.

## Assumption Validation Pass

These assumptions were checked against the current TypeFerry repository before
this revision:

- `typeferry-ts/tsconfig.build.json` already includes `src/**/*`, so adding
  `src/calls/**` does not require a tsconfig include change.
- `bun run typecheck` currently succeeds in `typeferry-ts/`, so the package is
  in a clean TypeScript baseline for this plan.
- `Client.channel(name)` returns `ClientChannel | Client | null`; it returns
  `null` for invalid/falsy names. The TypeFerry transport must guard that case
  instead of assuming a channel object.
- TypeFerry server channels warn for unregistered events. The server helper or
  documentation must include direct-call event registration guidance.
- The generic server helper cannot prove application authorization by itself.
  Authorization tests must use a concrete example namespace with app-supplied
  `authorizeSession`/`getSessionPeerId` callbacks.

## Product Requirements

The extension must support these behaviors:

- one-to-one calls between authenticated peers
- audio-only calls by default
- camera toggling before, during, and after connection establishment
- remote video appearing when the peer enables camera later
- muting local microphone without renegotiation
- explicit answer, decline, end, and timeout flows
- offer/answer glare handling with perfect-negotiation roles
- ICE candidate queueing before remote description is ready
- deterministic initial offer dispatch from caller
- reconnection-safe TypeFerry subscription binding
- deterministic cleanup on controller disconnect, call end, and peer end
- optional diagnostics suitable for UI display and bug reports
- framework-neutral core with a React adapter

The extension must not require:

- a TypeFerry server database
- a built-in friend/conversation model
- a particular TURN provider
- app UI components
- a UI-framework dependency in core consumers

## Proposed Public API

### Package Exports

Add a new `./calls` export and re-export the adapter helper from the React surface:

```json
{
  "exports": {
    "./calls": {
      "types": "./dist/calls/index.d.ts",
      "import": "./dist/calls/index.js"
    },
    "./react": {
      "types": "./dist/react/index.d.ts",
      "import": "./dist/react/index.js"
    }
  }
}
```

Consumers use the core directly when they own rendering:

```ts
import {
  DirectCallController,
  createTypeFerryDirectCallTransport,
} from 'typeferry-ts/calls'

const controller = new DirectCallController({
  transport: createTypeFerryDirectCallTransport({
    client,
    events: {
      answered: 'direct-call:answered',
      declined: 'direct-call:declined',
      ended: 'direct-call:ended',
      incoming: 'direct-call:incoming',
      signal: 'direct-call:signal',
    },
    getUserChannel: userId => `user:${userId}`,
    methods: {
      answer: 'directCall.answer',
      decline: 'directCall.decline',
      end: 'directCall.end',
      signal: 'directCall.signal',
      start: 'directCall.start',
    },
    selfId: () => String(client.context.userId ?? ''),
  }),
})
```

React consumers use:

```ts
import { useDirectCall } from 'typeferry-ts/react'

const call = useDirectCall({
  peerId,
  contextId: conversationId,
  transport: transportOptions,
})
```

### Core Types

Create `typeferry-ts/src/calls/types.ts`:

```ts
export type DirectCallId = string
export type DirectCallPeerId = string
export type DirectCallContextId = string

export type DirectCallStatus =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended'
  | 'declined'
  | 'failed'

export type DirectCallCameraStatus = 'off' | 'starting' | 'on' | 'failed'

export type DirectCallEndReason =
  | 'local-ended'
  | 'remote-ended'
  | 'declined'
  | 'missed'
  | 'failed'
  | 'controller-disposed'

export type DirectCallDescriptionType =
  | 'answer'
  | 'offer'
  | 'pranswer'
  | 'rollback'

export interface DirectCallSession {
  callId: DirectCallId
  contextId: DirectCallContextId
  callerId: DirectCallPeerId
  recipientId: DirectCallPeerId
  createdAt: Date
  expiresAt?: Date
}

export interface DirectCallSessionDescription {
  type: DirectCallDescriptionType
  sdp?: string
}

export interface DirectCallIceCandidate {
  candidate: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type DirectCallSignalPayload =
  | {
      kind: 'description'
      description: DirectCallSessionDescription
    }
  | {
      kind: 'candidate'
      candidate: DirectCallIceCandidate
    }

export interface DirectCallSignal {
  callId: DirectCallId
  contextId: DirectCallContextId
  senderId: DirectCallPeerId
  recipientId: DirectCallPeerId
  payload: DirectCallSignalPayload
  at: Date
}

export interface DirectCallEnd {
  callId: DirectCallId
  contextId: DirectCallContextId
  userId: DirectCallPeerId
  reason?: DirectCallEndReason
  at: Date
}

export interface DirectCallState {
  status: DirectCallStatus
  incomingSession: DirectCallSession | null
  activeSession: DirectCallSession | null
  remoteStream: MediaStream | null
  localAudioStream: MediaStream | null
  localVideoStream: MediaStream | null
  muted: boolean
  cameraStatus: DirectCallCameraStatus
  error: DirectCallError | null
  diagnostics: DirectCallDiagnostics
}

export interface DirectCallDiagnostics {
  connectionState: RTCPeerConnectionState | null
  iceConnectionState: RTCIceConnectionState | null
  signalingState: RTCSignalingState | null
  pendingIceCandidateCount: number
  pendingSignalCount: number
  lastSignalAt: Date | null
  lastNegotiationAt: Date | null
  lastErrorAt: Date | null
  offerCount: number
  answerCount: number
  candidateCount: number
}

export interface DirectCallError {
  code:
    | 'media-unavailable'
    | 'camera-unavailable'
    | 'microphone-unavailable'
    | 'signaling-failed'
    | 'peer-connection-failed'
    | 'authorization-failed'
    | 'unsupported-browser'
  message: string
  cause?: unknown
}
```

### Signaling Transport Interface

Create `typeferry-ts/src/calls/signaling-transport.ts`:

```ts
import type {
  DirectCallEnd,
  DirectCallSession,
  DirectCallSignal,
  DirectCallSignalPayload,
} from './types'

export interface DirectCallStartParams {
  contextId: string
  peerId: string
}

export interface DirectCallSessionParams {
  callId: string
  contextId: string
}

export interface DirectCallSignalParams {
  callId: string
  contextId: string
  recipientId: string
  payload: DirectCallSignalPayload
}

export interface DirectCallTransportHandlers {
  incoming: (session: DirectCallSession) => void
  answered: (event: DirectCallEnd) => void
  declined: (event: DirectCallEnd) => void
  ended: (event: DirectCallEnd) => void
  signal: (signal: DirectCallSignal) => void
}

export interface DirectCallSignalingTransport {
  selfId: () => string | null | undefined
  start: (params: DirectCallStartParams) => Promise<DirectCallSession>
  answer: (params: DirectCallSessionParams) => Promise<void>
  decline: (params: DirectCallSessionParams) => Promise<void>
  end: (params: DirectCallSessionParams) => Promise<void>
  signal: (params: DirectCallSignalParams) => Promise<void>
  subscribe: (handlers: DirectCallTransportHandlers) => () => void
}
```

### Controller Options

Create `typeferry-ts/src/calls/direct-call-controller.ts`:

```ts
export interface DirectCallControllerOptions {
  transport: DirectCallSignalingTransport
  contextId?: string | (() => string | null | undefined)
  peerId?: string | (() => string | null | undefined)
  iceServers?: RTCIceServer[]
  audio?: boolean | MediaTrackConstraints
  video?: boolean | MediaTrackConstraints
  autoSubscribe?: boolean
  ringTimeoutMs?: number
  getPeerConnection?: (
    configuration: RTCConfiguration,
  ) => RTCPeerConnection
  getUserMedia?: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>
}
```

Defaults:

```ts
export const defaultDirectCallOptions = {
  audio: true,
  autoSubscribe: true,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  ringTimeoutMs: 45_000,
  video: {
    aspectRatio: 16 / 9,
    facingMode: 'user',
    height: { ideal: 720 },
    width: { ideal: 1280 },
  },
} satisfies Pick<
  Required<DirectCallControllerOptions>,
  'audio' | 'autoSubscribe' | 'iceServers' | 'ringTimeoutMs' | 'video'
>
```

Applications that need production-grade NAT traversal must pass TURN servers:

```ts
const controller = new DirectCallController({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      credential: turnCredential,
      urls: ['turns:turn.example.com:5349'],
      username: turnUsername,
    },
  ],
  transport,
})
```

## State Machine

The controller owns a single active or incoming call at a time.

```text
idle
  startCall() -> calling
  incoming(session) -> ringing

calling
  answered(event) -> connecting
  local media or signaling failure -> failed
  decline/end/timeout -> ended

ringing
  answerCall() -> connecting
  declineCall() -> declined -> idle
  remote end/timeout -> ended -> idle

connecting
  connectionState connected OR ice connected/completed -> active
  ice disconnected -> reconnecting
  failed/closed before local end -> failed

active
  ice disconnected -> reconnecting
  remote end/local end -> ended -> idle
  failed -> failed

reconnecting
  ice connected/completed -> active
  failed/timeout -> failed
```

Rules:

- `disconnected` is not a terminal failure. Treat it as transient until `failed`, `closed`, or an app-defined timeout.
- Receiving an answer after the connection has already reached `active` must not demote the UI to `connecting`.
- Remote streams must be published as fresh `MediaStream` snapshots whenever tracks change.
- Cleanup must stop local tracks, close the peer connection, clear pending signals/candidates, unsubscribe, and notify subscribers exactly once.

## WebRTC Negotiation Contract

The controller implements perfect negotiation internally:

- caller is impolite
- answerer is polite
- `makingOffer` guards local offer creation
- collisions are ignored only by the impolite peer
- polite collision handling must be covered by tests; use the browser's
  `setRemoteDescription(offer)` collision behavior where supported, and only
  add explicit rollback if a target browser test proves it is necessary
- ICE candidates received before `remoteDescription` are queued
- camera changes call `replaceTrack` on the reserved video sender
- the video transceiver is reserved before the initial offer
- the initial caller offer is sent explicitly after local audio tracks are attached
- native `onnegotiationneeded` is a fallback, not the sole initial-offer mechanism

The initial setup sequence must be:

```ts
const session = await transport.start({ contextId, peerId })
// createPeerConnection reserves the video transceiver before any offer.
const connection = createPeerConnection(session, { polite: false })
await attachLocalAudio(connection)
await sendOffer(connection, session)
```

The answer sequence must be:

```ts
const connection = createPeerConnection(incomingSession, { polite: true })
await transport.answer({
  callId: incomingSession.callId,
  contextId: incomingSession.contextId,
})
await flushPendingSignals()
```

When an offer arrives:

```ts
await connection.setRemoteDescription(description)
await attachLocalAudio(connection)
const answer = await connection.createAnswer()
await connection.setLocalDescription(answer)
await transport.signal({
  callId: session.callId,
  contextId: session.contextId,
  recipientId: getSessionPeerId(session),
  payload: {
    kind: 'description',
    description: toDirectCallDescription(connection.localDescription),
  },
})
await flushPendingIceCandidates()
```

## File Structure

Create or modify these files:

- Create `typeferry-ts/src/calls/index.ts` for public exports.
- Create `typeferry-ts/src/calls/types.ts` for shared types.
- Create `typeferry-ts/src/calls/signaling-transport.ts` for app transport contracts.
- Create `typeferry-ts/src/calls/typeferry-transport.ts` for the default client/channel transport adapter.
- Create `typeferry-ts/src/calls/direct-call-controller.ts` for the framework-neutral engine.
- Create `typeferry-ts/src/calls/direct-call-controller.unit.spec.ts` for state-machine and fake WebRTC tests.
- Create `typeferry-ts/src/calls/typeferry-transport.unit.spec.ts` for transport method/event wiring.
- Create `typeferry-ts/src/calls/server.ts` for generic server helper types and schemas.
- Create `typeferry-ts/src/calls/server.unit.spec.ts` for schemas and event helper tests.
- Create `typeferry-ts/src/calls/server.integration.spec.ts` for route/auth helper tests.
- Create `typeferry-ts/src/react/hooks/use-direct-call.tsx` for the React hook.
- Modify `typeferry-ts/src/react/hooks/index.ts` and `typeferry-ts/src/react/index.ts` to export the hook.
- Create `typeferry-ts/src/react/hooks/use-direct-call.unit.spec.tsx` for React adapter behavior.
- Modify `typeferry-ts/package.json` to add `./calls` export.
- Modify `typeferry-ts/tsconfig.build.json` only if declarations do not include the new folder.
- Create `docs/calls/direct-call-controller.md` as consumer documentation.
- Modify `PROTOCOL.md` only if the implementation adds normative wire envelopes beyond ordinary app events/methods. If the default transport only wraps existing TypeFerry RPC and event primitives, document the extension in `docs/calls/` instead.

## Task 1: Core Types and Public Export

**Files:**
- Create: `typeferry-ts/src/calls/types.ts`
- Create: `typeferry-ts/src/calls/signaling-transport.ts`
- Create: `typeferry-ts/src/calls/index.ts`
- Modify: `typeferry-ts/package.json`

**Execution:**
- Owner: `worker`
- Support: `none`
- Risk: `low`
- Verification: `cd typeferry-ts && bun run typecheck`

- [ ] **Step 1: Create `types.ts`**

Paste the complete type block from the "Core Types" section into `typeferry-ts/src/calls/types.ts`.

- [ ] **Step 2: Create `signaling-transport.ts`**

Paste the complete transport interface block from the "Signaling Transport Interface" section into `typeferry-ts/src/calls/signaling-transport.ts`.

- [ ] **Step 3: Create `index.ts`**

```ts
export * from './types'
export * from './signaling-transport'
export * from './typeferry-transport'
export * from './direct-call-controller'
export * from './server'
```

- [ ] **Step 4: Add the package export**

Add this entry to `typeferry-ts/package.json` `exports`:

```json
"./calls": {
  "types": "./dist/calls/index.d.ts",
  "import": "./dist/calls/index.js"
}
```

- [ ] **Step 5: Verify types**

Run:

```bash
cd typeferry-ts
bun run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add typeferry-ts/src/calls/types.ts typeferry-ts/src/calls/signaling-transport.ts typeferry-ts/src/calls/index.ts typeferry-ts/package.json
git commit -m "feat: add direct call extension types"
```

## Task 2: Framework-Neutral Controller Skeleton

**Files:**
- Create: `typeferry-ts/src/calls/direct-call-controller.ts`
- Create: `typeferry-ts/src/calls/direct-call-controller.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `none`
- Risk: `medium`
- Verification: `cd typeferry-ts && bun run test:unit -- src/calls/direct-call-controller.unit.spec.ts`

- [ ] **Step 1: Write the controller construction test**

```ts
import { describe, expect, it, vi } from 'vitest'

import { DirectCallController } from './direct-call-controller'
import type { DirectCallSignalingTransport } from './signaling-transport'

function createTransport(): DirectCallSignalingTransport {
  return {
    selfId: () => 'user-1',
    start: vi.fn(),
    answer: vi.fn(),
    decline: vi.fn(),
    end: vi.fn(),
    signal: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  }
}

describe('DirectCallController', () => {
  it('starts idle and subscribes through the supplied transport', () => {
    const transport = createTransport()
    const controller = new DirectCallController({ transport })

    expect(controller.state.status).toBe('idle')
    expect(controller.state.activeSession).toBeNull()
    expect(controller.state.incomingSession).toBeNull()
    expect(transport.subscribe).toHaveBeenCalledTimes(1)

    controller.dispose()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd typeferry-ts
bun run test:unit -- src/calls/direct-call-controller.unit.spec.ts
```

Expected: fail because `DirectCallController` does not exist.

- [ ] **Step 3: Implement the minimal observable controller**

```ts
import type { DirectCallSignalingTransport } from './signaling-transport'
import type { DirectCallState } from './types'

export type DirectCallStateListener = (state: DirectCallState) => void

export interface DirectCallControllerOptions {
  transport: DirectCallSignalingTransport
  contextId?: string | (() => string | null | undefined)
  peerId?: string | (() => string | null | undefined)
  iceServers?: RTCIceServer[]
  audio?: boolean | MediaTrackConstraints
  video?: boolean | MediaTrackConstraints
  autoSubscribe?: boolean
  ringTimeoutMs?: number
  getPeerConnection?: (
    configuration: RTCConfiguration,
  ) => RTCPeerConnection
  getUserMedia?: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>
}

export function createInitialDirectCallState(): DirectCallState {
  return {
    activeSession: null,
    cameraStatus: 'off',
    diagnostics: {
      answerCount: 0,
      candidateCount: 0,
      connectionState: null,
      iceConnectionState: null,
      lastErrorAt: null,
      lastNegotiationAt: null,
      lastSignalAt: null,
      offerCount: 0,
      pendingIceCandidateCount: 0,
      pendingSignalCount: 0,
      signalingState: null,
    },
    error: null,
    incomingSession: null,
    localAudioStream: null,
    localVideoStream: null,
    muted: false,
    remoteStream: null,
    status: 'idle',
  }
}

export class DirectCallController {
  private readonly transport: DirectCallSignalingTransport
  private readonly listeners = new Set<DirectCallStateListener>()
  private unsubscribe: (() => void) | null = null
  private currentState: DirectCallState = createInitialDirectCallState()

  constructor(options: DirectCallControllerOptions) {
    this.transport = options.transport
    if (options.autoSubscribe ?? true) {
      this.unsubscribe = this.transport.subscribe({
        incoming: session => this.setState({ incomingSession: session, status: 'ringing' }),
        answered: () => this.setState({ status: 'connecting' }),
        declined: () => this.reset('declined'),
        ended: () => this.reset('remote-ended'),
        signal: () => undefined,
      })
    }
  }

  get state(): DirectCallState {
    return this.currentState
  }

  subscribe(listener: DirectCallStateListener): () => void {
    this.listeners.add(listener)
    listener(this.currentState)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.reset('controller-disposed')
  }

  private setState(patch: Partial<DirectCallState>): void {
    this.currentState = { ...this.currentState, ...patch }
    for (const listener of this.listeners) listener(this.currentState)
  }

  private reset(_reason: string): void {
    this.setState(createInitialDirectCallState())
  }
}
```

- [ ] **Step 4: Run the test and commit**

```bash
cd typeferry-ts
bun run test:unit -- src/calls/direct-call-controller.unit.spec.ts
git add typeferry-ts/src/calls/direct-call-controller.ts typeferry-ts/src/calls/direct-call-controller.unit.spec.ts
git commit -m "feat: add direct call controller skeleton"
```

## Task 3: WebRTC Peer Engine

**Files:**
- Modify: `typeferry-ts/src/calls/direct-call-controller.ts`
- Modify: `typeferry-ts/src/calls/direct-call-controller.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `reviewer`
- Risk: `high`
- Verification: unit tests with fake RTCPeerConnection; later browser tests validate real media APIs

- [ ] **Step 1: Add fake WebRTC tests before implementation**

Add tests that prove these behaviors:

```ts
it('sends an initial offer during startCall without waiting for negotiationneeded', async () => {
  const transport = createTransport()
  const session = {
    callId: 'call-1',
    contextId: 'conversation-1',
    callerId: 'user-1',
    recipientId: 'user-2',
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
  }
  vi.mocked(transport.start).mockResolvedValue(session)
  const controller = new DirectCallController({
    contextId: 'conversation-1',
    getPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
    getUserMedia: async () => createAudioStream(),
    peerId: 'user-2',
    transport,
  })

  await controller.startCall()

  expect(transport.signal).toHaveBeenCalledWith({
    callId: 'call-1',
    contextId: 'conversation-1',
    recipientId: 'user-2',
    payload: {
      kind: 'description',
      description: { sdp: 'offer', type: 'offer' },
    },
  })
})
```

```ts
it('publishes a new remote stream snapshot when a later video track arrives', async () => {
  const transport = createTransport()
  vi.mocked(transport.start).mockResolvedValue({
    callId: 'call-1',
    contextId: 'conversation-1',
    callerId: 'user-1',
    recipientId: 'user-2',
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
  })
  const connection = new FakePeerConnection()
  const controller = new DirectCallController({
    contextId: 'conversation-1',
    getPeerConnection: () => connection as unknown as RTCPeerConnection,
    getUserMedia: async () => createAudioStream(),
    peerId: 'user-2',
    transport,
  })
  const states: DirectCallState[] = []
  controller.subscribe(state => states.push(state))

  await controller.startCall()
  const peerStream = new MediaStream()
  connection.ontrack?.({
    streams: [peerStream],
    track: createAudioTrack(),
  } as unknown as RTCTrackEvent)
  const first = controller.state.remoteStream

  const videoTrack = createVideoTrack()
  peerStream.addTrack(videoTrack)
  connection.ontrack?.({
    streams: [peerStream],
    track: videoTrack,
  } as unknown as RTCTrackEvent)

  expect(controller.state.remoteStream).not.toBe(first)
  expect(controller.state.remoteStream?.getVideoTracks()).toContain(videoTrack)
})
```

Prefer exercising remote track behavior through the fake peer connection's
`ontrack` callback rather than adding public controller methods for tests.

- [ ] **Step 2: Implement WebRTC conversion helpers**

```ts
function toCandidateInit(candidate: RTCIceCandidate): DirectCallIceCandidate {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  }
}

function toDescriptionInit(
  description: RTCSessionDescription,
): DirectCallSessionDescription {
  return {
    sdp: description.sdp,
    type: description.type,
  }
}

function cloneMediaStream(stream: MediaStream): MediaStream {
  return new MediaStream(stream.getTracks())
}

function getSessionPeerId(session: DirectCallSession, selfId?: string | null): string {
  return session.callerId === selfId ? session.recipientId : session.callerId
}
```

- [ ] **Step 3: Implement peer connection creation**

The controller must store:

```ts
private peerConnection: RTCPeerConnection | null = null
private localAudioStream: MediaStream | null = null
private remoteMediaStream: MediaStream | null = null
private localVideoTrack: MediaStreamTrack | null = null
private videoTransceiver: RTCRtpTransceiver | null = null
private videoSender: RTCRtpSender | null = null
private pendingSignals: DirectCallSignal[] = []
private pendingIceCandidates: DirectCallIceCandidate[] = []
private polite = false
private makingOffer = false
private ignoreOffer = false
private negotiationSuppressed = false
private renegotiationPending = false
```

Creation must:

```ts
private createPeerConnection(
  session: DirectCallSession,
  polite: boolean,
): RTCPeerConnection {
  const connection = this.getPeerConnection({
    iceServers: this.iceServers,
  })

  this.polite = polite
  this.peerConnection = connection
  this.videoTransceiver = connection.addTransceiver('video', {
    direction: 'sendrecv',
  })
  this.videoSender = this.videoTransceiver.sender

  connection.onicecandidate = event => {
    if (!event.candidate) return
    void this.transport.signal({
      callId: session.callId,
      contextId: session.contextId,
      recipientId: getSessionPeerId(session, this.transport.selfId()),
      payload: { kind: 'candidate', candidate: toCandidateInit(event.candidate) },
    })
  }

  connection.ontrack = event => this.publishRemoteTrack(event)
  connection.onconnectionstatechange = () => this.updateConnectionStatus(connection)
  connection.oniceconnectionstatechange = () => this.updateConnectionStatus(connection)
  connection.onnegotiationneeded = () => {
    if (this.negotiationSuppressed) return
    void this.sendOffer(connection, session, { queueIfBusy: false })
  }

  return connection
}
```

- [ ] **Step 4: Implement `sendOffer`**

```ts
private async sendOffer(
  connection: RTCPeerConnection,
  session: DirectCallSession,
  options: { queueIfBusy?: boolean } = {},
): Promise<void> {
  const queueIfBusy = options.queueIfBusy ?? true

  if (
    this.makingOffer ||
    connection.signalingState !== 'stable' ||
    connection.connectionState === 'closed'
  ) {
    if (queueIfBusy) this.renegotiationPending = true
    return
  }

  try {
    this.renegotiationPending = false
    this.makingOffer = true
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    if (!connection.localDescription) return

    await this.transport.signal({
      callId: session.callId,
      contextId: session.contextId,
      recipientId: getSessionPeerId(session, this.transport.selfId()),
      payload: {
        kind: 'description',
        description: toDescriptionInit(connection.localDescription),
      },
    })
  } finally {
    this.makingOffer = false
  }
}
```

- [ ] **Step 5: Implement `startCall`, `answerCall`, and signal handling**

`startCall` must resolve `contextId` and `peerId`, call `transport.start`, create the peer connection, attach local audio, then call `sendOffer`. `answerCall` must create a polite connection, call `transport.answer`, then flush queued signals.

Signal handling must:

- queue signals if there is no active session or peer connection
- queue ICE until `remoteDescription` is present
- ignore impolite offer collisions
- set remote descriptions before answers
- flush pending ICE after remote description
- preserve `active` state if the connection is already connected

- [ ] **Step 6: Run targeted unit tests**

```bash
cd typeferry-ts
bun run test:unit -- src/calls/direct-call-controller.unit.spec.ts
```

Expected: all tests pass.

## Task 4: TypeFerry Client Transport

**Files:**
- Create: `typeferry-ts/src/calls/typeferry-transport.ts`
- Create: `typeferry-ts/src/calls/typeferry-transport.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `none`
- Risk: `medium`
- Verification: `cd typeferry-ts && bun run test:unit -- src/calls/typeferry-transport.unit.spec.ts`

- [ ] **Step 1: Define transport options**

```ts
import type { Client, ClientChannel } from '../client'

export interface TypeFerryDirectCallTransportEvents {
  incoming: string
  answered: string
  declined: string
  ended: string
  signal: string
}

export interface TypeFerryDirectCallTransportMethods {
  start: string
  answer: string
  decline: string
  end: string
  signal: string
}

export interface TypeFerryDirectCallTransportOptions {
  client: Client | (() => Client)
  selfId: () => string | null | undefined
  getUserChannel: (selfId: string) => string
  events: TypeFerryDirectCallTransportEvents
  methods: TypeFerryDirectCallTransportMethods
}
```

- [ ] **Step 2: Implement the transport**

```ts
export function createTypeFerryDirectCallTransport(
  options: TypeFerryDirectCallTransportOptions,
): DirectCallSignalingTransport {
  const getClient = (): Client =>
    typeof options.client === 'function' ? options.client() : options.client
  const events = [
    options.events.incoming,
    options.events.answered,
    options.events.declined,
    options.events.ended,
    options.events.signal,
  ]
  const hasListeners = (channel: ClientChannel, event: string): boolean => {
    const listeners = channel._events?.[event]
    return Array.isArray(listeners) ? listeners.length > 0 : !!listeners
  }

  return {
    selfId: options.selfId,
    start: params =>
      getClient().call(options.methods.start, params) as Promise<DirectCallSession>,
    answer: async params => {
      await getClient().call(options.methods.answer, params)
    },
    decline: async params => {
      await getClient().call(options.methods.decline, params)
    },
    end: async params => {
      await getClient().call(options.methods.end, params)
    },
    signal: async params => {
      await getClient().call(options.methods.signal, params)
    },
    subscribe: handlers => {
      const selfId = options.selfId()
      if (!selfId) return () => undefined

      const channel = getClient().channel(options.getUserChannel(selfId))
      if (!channel) return () => undefined
      channel.on(options.events.incoming, handlers.incoming)
      channel.on(options.events.answered, handlers.answered)
      channel.on(options.events.declined, handlers.declined)
      channel.on(options.events.ended, handlers.ended)
      channel.on(options.events.signal, handlers.signal)

      void channel.subscribe(events)

      return () => {
        channel.off(options.events.incoming, handlers.incoming)
        channel.off(options.events.answered, handlers.answered)
        channel.off(options.events.declined, handlers.declined)
        channel.off(options.events.ended, handlers.ended)
        channel.off(options.events.signal, handlers.signal)

        const unusedEvents = events.filter(event => !hasListeners(channel, event))
        if (unusedEvents.length > 0) {
          void channel.unsubscribe(unusedEvents)
        }
      }
    },
  }
}
```

- [ ] **Step 3: Test method and event wiring**

Test that `start`, `answer`, `decline`, `end`, and `signal` call the
configured method names with unchanged params, that `subscribe` binds all five
configured event names to the configured channel, that a `null` channel is a
no-op unsubscribe, and that one controller unsubscribing does not remove server
subscriptions while another local listener for the same event remains.

## Task 5: Generic Server Helper

**Files:**
- Create: `typeferry-ts/src/calls/server.ts`
- Create: `typeferry-ts/src/calls/server.unit.spec.ts`
- Create: `typeferry-ts/src/calls/server.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `reviewer`
- Risk: `high`
- Verification: `cd typeferry-ts && bun run test:unit -- src/calls/server.unit.spec.ts && bun run test:integration -- src/calls/server.integration.spec.ts`

Server helpers must not assume conversations or friends. They provide schemas,
event registration helpers, and example-safe emit helpers. The concrete
namespace still belongs to the application because the application owns session
storage and authorization policy.

```ts
export interface DirectCallServerContext<TClient, TSession> {
  getSelfId: (client: TClient) => string
  createSession: (client: TClient, params: DirectCallStartParams) => Promise<TSession>
  authorizeSession: (
    client: TClient,
    params: DirectCallSessionParams,
  ) => Promise<TSession>
  getSessionPeerId: (session: TSession, selfId: string) => string
  getUserChannel: (userId: string) => string
}
```

The helper should expose utility functions rather than force decorator magic:

```ts
export interface DirectCallServerEvents {
  incoming: string
  answered: string
  declined: string
  ended: string
  signal: string
}

export function registerDirectCallEvents(
  server: { channel: (name: string) => { addEvent: (event: string) => void } },
  channelName: string,
  events: DirectCallServerEvents,
): void {
  const channel = server.channel(channelName)
  channel.addEvent(events.incoming)
  channel.addEvent(events.answered)
  channel.addEvent(events.declined)
  channel.addEvent(events.ended)
  channel.addEvent(events.signal)
}

export function emitDirectCallSession(
  server: { channel: (name: string) => { emit: (event: string, value: unknown) => void } },
  channel: string,
  event: string,
  session: DirectCallSession,
): void {
  server.channel(channel).emit(event, session)
}
```

Applications can still write decorated methods in their own namespace, but use shared schemas and emit helpers:

```ts
@Namespace('directCall')
@Protected()
class DirectCallMethods {
  @Method()
  @Schema(directCallStartSchema)
  async start(client: ClientNode, params: DirectCallStartParams) {
    const session = await callContext.createSession(client, params)
    const recipientId = callContext.getSessionPeerId(
      session,
      callContext.getSelfId(client),
    )
    emitDirectCallSession(
      global.TypeFerry,
      callContext.getUserChannel(recipientId),
      events.incoming,
      session,
    )
    return session
  }
}
```

Tests must prove:

- schema unit tests accept valid SDP/candidate payloads and reject malformed
  payloads
- `registerDirectCallEvents` registers all five configured event names on the
  supplied channel
- outsider clients cannot answer, signal, or end sessions they are not authorized to access
- signal payloads are emitted only to the resolved peer
- app-supplied `getUserChannel` is honored
- the integration test defines a tiny example namespace using the helper
  callbacks; do not test authorization against the helper alone

## Task 6: React Adapter

**Files:**
- Create: `typeferry-ts/src/react/hooks/use-direct-call.tsx`
- Create: `typeferry-ts/src/react/hooks/use-direct-call.unit.spec.tsx`
- Modify: `typeferry-ts/src/react/hooks/index.ts`
- Modify: `typeferry-ts/src/react/index.ts`

**Execution:**
- Owner: `worker`
- Support: `none`
- Risk: `medium`
- Verification: `cd typeferry-ts && bun run test:unit -- src/react/hooks/use-direct-call.unit.spec.tsx`

Implement a hook that creates exactly one core controller per stable
transport/options identity and subscribes via `useSyncExternalStore`. Because
React callers often allocate option objects inline, the hook must either require
a stable `controllerKey` or normalize primitive option fields into an internal
key. Prefer an explicit `controllerKey` for call contexts.

```ts
export function useDirectCall(options: UseDirectCallOptions): DirectCallControllerView {
  const client = useClient()
  const controllerKey =
    options.controllerKey ??
    `${options.contextId ?? ''}:${options.peerId ?? ''}:${options.transportKey ?? 'default'}`
  const controller = useMemo(
    () =>
      new DirectCallController({
        ...options,
        transport: createTypeFerryDirectCallTransport({
          ...options.transport,
          client,
        }),
      }),
    [client, controllerKey],
  )

  useEffect(() => () => controller.dispose(), [controller])

  const state = useSyncExternalStore(
    callback => controller.subscribe(callback),
    () => controller.state,
    () => controller.state,
  )

  return {
    ...state,
    answerCall: () => controller.answerCall(),
    declineCall: () => controller.declineCall(),
    endCall: () => controller.endCall(),
    startCall: () => controller.startCall(),
    toggleCamera: () => controller.toggleCamera(),
    toggleMuted: () => controller.toggleMuted(),
  }
}
```

Tests must prove:

- rerenders do not create a new controller when options are stable
- rerenders with an inline options object do not recreate the controller when
  `controllerKey` is unchanged
- changing `controllerKey` disposes the previous controller and creates the next
  controller
- changing `transportKey` recreates the controller when method names, event
  names, channel derivation, or ICE configuration change
- unmount calls `dispose`
- state updates propagate to hook consumers
- changing the TypeFerry client disposes and recreates the controller

## Task 7: Browser-Level Media Tests

**Files:**
- Create: `typeferry-ts/src/calls/direct-call-controller.browser.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: `cd typeferry-ts && bun run test:browser -- src/calls/direct-call-controller.browser.spec.ts`

Browser tests should use real `MediaStream`, canvas capture streams, and fake peer connections only where needed. Cover:

- local camera stream creates a visible video track
- remote stream snapshots update when tracks are added
- track `mute`, `unmute`, and `ended` events update state
- cleanup stops local tracks
- calling `toggleCamera` twice results in no live local video track

Do not use jsdom for these tests.

## Task 8: Diagnostics and Debuggability

**Files:**
- Modify: `typeferry-ts/src/calls/types.ts`
- Modify: `typeferry-ts/src/calls/direct-call-controller.ts`
- Modify: `docs/calls/direct-call-controller.md`

**Execution:**
- Owner: `worker`
- Support: `reviewer`
- Risk: `medium`
- Verification: unit tests assert diagnostic counters and final states

Diagnostics must expose:

- `connectionState`
- `iceConnectionState`
- `signalingState`
- offer, answer, and candidate counts
- pending signal and candidate counts
- last signal, negotiation, and error times
- current local audio/video track counts
- current remote audio/video track counts

Add a serializable helper:

```ts
export function snapshotDirectCallDiagnostics(
  state: DirectCallState,
): Record<string, unknown> {
  return {
    activeCallId: state.activeSession?.callId ?? null,
    answerCount: state.diagnostics.answerCount,
    candidateCount: state.diagnostics.candidateCount,
    cameraStatus: state.cameraStatus,
    connectionState: state.diagnostics.connectionState,
    iceConnectionState: state.diagnostics.iceConnectionState,
    offerCount: state.diagnostics.offerCount,
    pendingIceCandidateCount: state.diagnostics.pendingIceCandidateCount,
    pendingSignalCount: state.diagnostics.pendingSignalCount,
    remoteAudioTracks: state.remoteStream?.getAudioTracks().length ?? 0,
    remoteVideoTracks: state.remoteStream?.getVideoTracks().length ?? 0,
    signalingState: state.diagnostics.signalingState,
    status: state.status,
  }
}
```

## Task 9: Documentation

**Files:**
- Create: `docs/calls/direct-call-controller.md`
- Modify: `README.md` if the repository overview lists package surfaces

**Execution:**
- Owner: `worker`
- Support: `reviewer`
- Risk: `low`
- Verification: `rg -n "DirectCallController|typeferry-ts/calls" docs README.md`

Documentation must include:

- quick start for core controller
- quick start for React
- server integration example
- TURN configuration guidance
- state machine table
- troubleshooting matrix

Troubleshooting matrix:

| Symptom | Likely cause | Diagnostic signal | Fix |
| --- | --- | --- | --- |
| Stuck on `calling` | recipient did not receive incoming event | no `answered` event | verify subscription channel and auth |
| Stuck on `connecting` | no initial offer, no answer, or ICE cannot connect | `offerCount`, `answerCount`, `iceConnectionState` | inspect signaling events, add TURN |
| One-way video | remote track arrived but UI did not refresh, or camera renegotiation skipped | remote video track count, offer count after camera toggle | verify stream snapshots and queued renegotiation |
| Works locally, fails across networks | STUN-only NAT traversal | ICE `failed` with candidates exchanged | configure TURN |
| UI says connecting while media flows | status overwritten after active connection | ICE `connected` but status `connecting` | ensure active state is never demoted by late answer |

## Acceptance Criteria

The extension is complete when:

- `typeferry-ts/calls` exports the core controller and types.
- The React adapter uses the framework-neutral core controller.
- Server helpers are optional and app-policy agnostic.
- Initial caller offer is sent deterministically.
- Camera toggles renegotiate or queue renegotiation until stable.
- Remote stream snapshots change when track sets change.
- ICE `connected` and `completed` promote calls to `active`.
- ICE `disconnected` is transient, not terminal.
- Cleanup stops local media tracks and closes peer connections.
- Tests pass:

```bash
cd typeferry-ts
bun run test:unit -- src/calls src/react/hooks/use-direct-call.unit.spec.tsx
bun run test:integration -- src/calls/server.integration.spec.ts
bun run test:browser -- src/calls/direct-call-controller.browser.spec.ts
bun run typecheck
bun run build
```

## Migration Plan for ExampleApp

After publishing TypeFerry with this extension:

1. Update ExampleApp with `bun update typeferry-ts --latest`.
2. Replace `src/client/systems/example-app/pages/use-direct-voice-call.ts` with `useDirectCall` from TypeFerry.
3. Keep ExampleApp's `directVoice` methods initially, but convert them to use TypeFerry's server schemas and emit helpers.
4. Keep the direct chat rail UI in React until the controller migration is stable.
5. Delete ExampleApp's local WebRTC fake tests after equivalent TypeFerry tests pass and ExampleApp has one browser integration test proving app wiring.

## Self-Review

Spec coverage:

- Core controller, WebRTC behavior, signaling transport, server helper, React adapter, diagnostics, docs, and ExampleApp migration are each mapped to tasks.

Placeholder scan:

- No task uses "TBD", "TODO", "implement later", or generic "add tests" language. Each test task names concrete behaviors and includes representative code.

Type consistency:

- Public types use `DirectCall*` names consistently.
- Transport uses `contextId` instead of app-specific `conversationId`.
- Adapters wrap `DirectCallController` instead of duplicating signaling logic.

Risk review:

- High-risk work is limited to WebRTC engine and server helper authorization.
- UI adapters are deliberately thin and tested against controller snapshots.
- TURN is treated as configuration, not hidden framework policy.

Revision applied:

- The original instinct to put all server behavior behind generated decorators was rejected. TypeFerry can provide schemas and helpers, but applications must retain domain authorization and session ownership.
- The TypeFerry transport sketch now accounts for `Client.channel()` returning
  `null` and unsubscribes only from events with no remaining local listeners.
- The remote-track regression test now drives the fake peer connection's
  `ontrack` callback rather than adding public test-only controller methods.
- The React adapter now requires a stable `controllerKey`/`transportKey`
  boundary so inline options do not accidentally recreate live peer
  connections.
