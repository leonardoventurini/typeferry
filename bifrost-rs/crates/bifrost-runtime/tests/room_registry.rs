//! Unit tests for `RoomRegistry` join/leave/broadcast semantics.

use async_trait::async_trait;
use bifrost_runtime::{BifrostSocket, RoomRegistry, SocketState};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

struct MockSocket {
    id: u64,
    state: AtomicU8,
    sent: Mutex<Vec<String>>,
}

impl MockSocket {
    fn new(id: u64) -> Arc<Self> {
        Arc::new(Self {
            id,
            state: AtomicU8::new(SocketState::OPEN),
            sent: Mutex::new(vec![]),
        })
    }

    fn mark_closed(&self) {
        self.state.store(SocketState::CLOSED, Ordering::Relaxed);
    }

    fn sent(&self) -> Vec<String> {
        self.sent.lock().unwrap().clone()
    }
}

#[async_trait]
impl BifrostSocket for MockSocket {
    fn ready_state(&self) -> u8 {
        self.state.load(Ordering::Relaxed)
    }
    async fn send(&self, data: String) {
        self.sent.lock().unwrap().push(data);
    }
    async fn close(&self) {
        self.mark_closed();
    }
    fn id(&self) -> u64 {
        self.id
    }
}

#[test]
fn join_and_has() {
    let rooms = RoomRegistry::new();
    let s = MockSocket::new(1);
    rooms.join(s.clone() as Arc<dyn BifrostSocket>, "room-a");
    assert!(rooms.has(&*s, "room-a"));
    assert!(!rooms.has(&*s, "room-b"));
}

#[test]
fn leave_cleans_up_empty_room() {
    let rooms = RoomRegistry::new();
    let s = MockSocket::new(1);
    rooms.join(s.clone() as Arc<dyn BifrostSocket>, "room-a");
    rooms.leave(&*s, "room-a");
    assert!(!rooms.has(&*s, "room-a"));
    assert_eq!(rooms.room_size("room-a"), 0);
}

#[test]
fn leave_all_removes_from_every_room() {
    let rooms = RoomRegistry::new();
    let s = MockSocket::new(1);
    rooms.join(s.clone() as Arc<dyn BifrostSocket>, "a");
    rooms.join(s.clone() as Arc<dyn BifrostSocket>, "b");
    rooms.leave_all(&*s);
    assert_eq!(rooms.room_size("a"), 0);
    assert_eq!(rooms.room_size("b"), 0);
}

#[tokio::test]
async fn broadcast_sends_to_every_open_socket() {
    let rooms = RoomRegistry::new();
    let a = MockSocket::new(1);
    let b = MockSocket::new(2);
    let closed = MockSocket::new(3);
    closed.mark_closed();
    rooms.join(a.clone() as Arc<dyn BifrostSocket>, "room");
    rooms.join(b.clone() as Arc<dyn BifrostSocket>, "room");
    rooms.join(closed.clone() as Arc<dyn BifrostSocket>, "room");

    rooms.broadcast("room", "ping", None).await;

    assert_eq!(a.sent(), vec!["ping".to_string()]);
    assert_eq!(b.sent(), vec!["ping".to_string()]);
    assert!(closed.sent().is_empty());
}

#[tokio::test]
async fn broadcast_honors_exclude_id() {
    let rooms = RoomRegistry::new();
    let a = MockSocket::new(1);
    let b = MockSocket::new(2);
    rooms.join(a.clone() as Arc<dyn BifrostSocket>, "room");
    rooms.join(b.clone() as Arc<dyn BifrostSocket>, "room");

    rooms.broadcast("room", "x", Some(1)).await;

    assert!(a.sent().is_empty());
    assert_eq!(b.sent(), vec!["x".to_string()]);
}

#[test]
fn room_size_reports_correct_count() {
    let rooms = RoomRegistry::new();
    let a = MockSocket::new(1);
    let b = MockSocket::new(2);
    assert_eq!(rooms.room_size("room"), 0);
    rooms.join(a.clone() as Arc<dyn BifrostSocket>, "room");
    rooms.join(b.clone() as Arc<dyn BifrostSocket>, "room");
    assert_eq!(rooms.room_size("room"), 2);
}
