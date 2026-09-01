//! TypeFerry — type-safe real-time RPC framework.
//!
//! Single-import umbrella over the workspace's modular crates. Pulls
//! the core runtime + protocol + EJSON in by default; transports,
//! authoring macros, Redis, and auth live behind feature flags so
//! consumers only compile what they use.
//!
//! ```toml
//! # Cargo.toml
//! typeferry = { version = "0.0.1", features = ["full"] }
//! ```
//!
//! Available features:
//!
//! | Feature | Pulls in        |
//! |---------|-----------------|
//! | `http`  | [`typeferry_http`] (axum HTTP transport — `POST /__h`)            |
//! | `ws`    | [`typeferry_ws`]   (axum WebSocket transport — `/typeferry-ws`)      |
//! | `redis` | [`typeferry_redis`] (multi-instance event propagation)             |
//! | `auth`  | [`typeferry_auth`] (JWT, cookies, sessions, OAuth)                 |
//! | `macros`| [`typeferry_macros`] (`#[typeferry::method]`, `register!`)            |
//! | `full`  | all of the above                                                 |
//!
//! See `PROTOCOL.md` at the repo root for the wire-protocol spec.

// ---------------------------------------------------------------------------
// Core surfaces — always available.
// ---------------------------------------------------------------------------

/// Wire-protocol primitives (constants, enums, message envelopes).
pub use typeferry_protocol as protocol;

/// EJSON serialization (`Date`, `Binary`, `RegExp`, `NaN/Inf`, custom types).
pub use typeferry_ejson as ejson;

/// Server runtime: `Server`, `Method`, `Event`, `RoomRegistry`, etc.
pub use typeferry_runtime as runtime;

// Re-export the most commonly used runtime types so consumers can
// write `use typeferry::{Server, Method}` without `typeferry::runtime::`.
pub use typeferry_runtime::{
    AuthFn, BoxResult, ClientNode, Event, EventOptions, Method, MethodOptions, PublicError,
    RoomRegistry, RpcHandler, SchemaValidationError, SchemaValidator, Server, ServerOptions,
    SocketState, TypeFerryContext, TypeFerryError, TypeFerrySocket, ValidationIssue,
    ValidationResult,
};

// ---------------------------------------------------------------------------
// Optional transports + authoring + auth.
// ---------------------------------------------------------------------------

#[cfg(feature = "http")]
pub use typeferry_http as http;

#[cfg(feature = "ws")]
pub use typeferry_ws as ws;

#[cfg(feature = "redis")]
pub use typeferry_redis as redis;

#[cfg(feature = "auth")]
pub use typeferry_auth as auth;

#[cfg(feature = "macros")]
pub use typeferry_macros::{method, register};
