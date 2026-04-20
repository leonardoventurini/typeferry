//! Server runtime: methods, events, rooms, channels, clients.
//!
//! Equivalent to `bifrost-ts/src/server/*` and
//! `bifrost-py/src/bifrost/server/*`.

pub mod client_node;
pub mod context;
pub mod error;
pub mod event;
pub mod method;
pub mod room_registry;
pub mod schema;
pub mod server;
pub mod server_channel;
pub mod socket;

pub use client_node::ClientNode;
pub use context::{BifrostContext, ExecutionContext};
pub use error::{BifrostError, PublicError, SchemaValidationError};
pub use event::{Event, EventOptions};
pub use method::{BoxResult, Method, MethodOptions, Middleware, RpcFuture, RpcHandler};
pub use room_registry::RoomRegistry;
pub use schema::{SchemaValidator, ValidationIssue, ValidationResult};
pub use server::{AuthFn, Server, ServerOptions};
pub use server_channel::ServerChannel;
pub use socket::{BifrostSocket, SocketState};
