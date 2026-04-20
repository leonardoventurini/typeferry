//! Bifrost — type-safe real-time RPC framework.
//!
//! Single-import umbrella over the workspace's modular crates. Pulls
//! the core runtime + protocol + EJSON in by default; transports,
//! authoring macros, Redis, and auth live behind feature flags so
//! consumers only compile what they use.
//!
//! ```toml
//! # Cargo.toml
//! bifrost = { version = "0.0.1", features = ["full"] }
//! ```
//!
//! Available features:
//!
//! | Feature | Pulls in        |
//! |---------|-----------------|
//! | `http`  | [`bifrost_http`] (axum HTTP transport — `POST /__h`)            |
//! | `ws`    | [`bifrost_ws`]   (axum WebSocket transport — `/bifrost-ws`)      |
//! | `redis` | [`bifrost_redis`] (multi-instance event propagation)             |
//! | `auth`  | [`bifrost_auth`] (JWT, cookies, sessions, OAuth)                 |
//! | `macros`| [`bifrost_macros`] (`#[bifrost::method]`, `register!`)            |
//! | `full`  | all of the above                                                 |
//!
//! See `PROTOCOL.md` at the repo root for the wire-protocol spec.

// ---------------------------------------------------------------------------
// Core surfaces — always available.
// ---------------------------------------------------------------------------

/// Wire-protocol primitives (constants, enums, message envelopes).
pub use bifrost_protocol as protocol;

/// EJSON serialization (`Date`, `Binary`, `RegExp`, `NaN/Inf`, custom types).
pub use bifrost_ejson as ejson;

/// Server runtime: `Server`, `Method`, `Event`, `RoomRegistry`, etc.
pub use bifrost_runtime as runtime;

// Re-export the most commonly used runtime types so consumers can
// write `use bifrost::{Server, Method}` without `bifrost::runtime::`.
pub use bifrost_runtime::{
    AuthFn, BifrostContext, BifrostError, BifrostSocket, BoxResult, ClientNode,
    Event, EventOptions, Method, MethodOptions, PublicError, RoomRegistry,
    RpcHandler, SchemaValidationError, SchemaValidator, Server, ServerOptions,
    SocketState, ValidationIssue, ValidationResult,
};

// ---------------------------------------------------------------------------
// Optional transports + authoring + auth.
// ---------------------------------------------------------------------------

#[cfg(feature = "http")]
pub use bifrost_http as http;

#[cfg(feature = "ws")]
pub use bifrost_ws as ws;

#[cfg(feature = "redis")]
pub use bifrost_redis as redis;

#[cfg(feature = "auth")]
pub use bifrost_auth as auth;

#[cfg(feature = "macros")]
pub use bifrost_macros::{method, register};
