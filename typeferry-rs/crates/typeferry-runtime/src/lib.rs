//! Server runtime: methods, events, rooms, channels, clients.
//!
//! Equivalent to `typeferry-ts/src/server/*` and
//! `typeferry-py/src/typeferry/server/*`.

pub mod client_node;
pub mod context;
pub(crate) mod default_methods;
pub mod error;
pub mod event;
pub mod method;
pub mod room_registry;
pub mod schema;
pub mod server;
pub mod server_channel;
pub mod socket;

pub use client_node::ClientNode;
pub use context::{ExecutionContext, TypeFerryContext};
pub use error::{PublicError, SchemaValidationError, TypeFerryError};
pub use event::{Event, EventOptions};
pub use method::{BoxResult, Method, MethodOptions, Middleware, RpcFuture, RpcHandler};
pub use room_registry::RoomRegistry;
pub use schema::{SchemaValidator, ValidationIssue, ValidationResult};
pub use server::{AuthFn, Server, ServerOptions};
pub use server_channel::ServerChannel;
pub use socket::{SocketState, TypeFerrySocket};
