//! `BifrostSocket` trait — the minimal surface the runtime needs from
//! a transport-owned WebSocket handle.

use async_trait::async_trait;

/// Numeric ready states matching JS `WebSocket.readyState`.
pub mod state {
    pub const CONNECTING: u8 = 0;
    pub const OPEN: u8 = 1;
    pub const CLOSING: u8 = 2;
    pub const CLOSED: u8 = 3;
}

pub use state as SocketState;

/// Minimal abstraction over a WebSocket. Transports provide a concrete
/// `impl BifrostSocket` that the runtime uses for broadcast, auth
/// result delivery, etc.
#[async_trait]
pub trait BifrostSocket: Send + Sync {
    /// Current connection state — one of the [`state`] constants.
    fn ready_state(&self) -> u8;

    /// Send a text frame. MUST be a no-op if the socket is not open.
    async fn send(&self, data: String);

    /// Close the socket; idempotent.
    async fn close(&self);

    /// Stable identity used for room membership and originator-exclusion.
    fn id(&self) -> u64;
}
