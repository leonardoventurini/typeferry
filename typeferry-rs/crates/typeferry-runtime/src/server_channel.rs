//! Server channel — per-channel event registry + broadcast path.

use crate::event::Event;
use crate::room_registry::RoomRegistry;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use typeferry_protocol::room_name;

pub struct ServerChannel {
    pub channel_name: String,
    /// Shared event map (owned by the Server, mirrored here by reference).
    pub(crate) events: Arc<RwLock<HashMap<String, Arc<Event>>>>,
    /// Optional shared RoomRegistry; None if no WS transport is attached.
    pub(crate) rooms: Arc<RwLock<Option<Arc<RoomRegistry>>>>,
}

impl ServerChannel {
    pub fn new(
        channel_name: impl Into<String>,
        events: Arc<RwLock<HashMap<String, Arc<Event>>>>,
        rooms: Arc<RwLock<Option<Arc<RoomRegistry>>>>,
    ) -> Self {
        Self {
            channel_name: channel_name.into(),
            events,
            rooms,
        }
    }

    pub fn add_event(&self, event: Arc<Event>) {
        let mut events = self.events.write().expect("events lock poisoned");
        events.insert(event.name.clone(), event);
    }

    pub fn get(&self, event: &str) -> Option<Arc<Event>> {
        self.events.read().ok()?.get(event).cloned()
    }

    /// Propagate a pre-encoded event frame to the local room.
    pub async fn propagate(&self, event: &str, payload: &str, exclude_id: Option<u64>) {
        let rooms = self.rooms.read().ok().and_then(|opt| opt.clone());
        let Some(rooms) = rooms else { return };
        let name = room_name(&self.channel_name, event);
        rooms.broadcast(&name, payload, exclude_id).await;
    }
}
