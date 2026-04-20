//! Redis pub/sub transport — PROTOCOL.md §2.3.

use bifrost_protocol::{NO_CHANNEL, REDIS_EVENTS_CHANNEL};
use bifrost_runtime::Server;
use futures::StreamExt;
use redis::AsyncCommands;
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct RedisTransport {
    server: Arc<Server>,
    url: String,
    publisher: Mutex<Option<redis::aio::MultiplexedConnection>>,
    listener: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl RedisTransport {
    pub fn new(server: Arc<Server>, url: impl Into<String>) -> Arc<Self> {
        Arc::new(Self {
            server,
            url: url.into(),
            publisher: Mutex::new(None),
            listener: Mutex::new(None),
        })
    }

    pub async fn connect(self: &Arc<Self>) -> Result<(), redis::RedisError> {
        let client = redis::Client::open(self.url.as_str())?;
        let pub_conn = client.get_multiplexed_async_connection().await?;
        *self.publisher.lock().await = Some(pub_conn);

        let sub_client = redis::Client::open(self.url.as_str())?;
        let mut sub_conn = sub_client.get_async_pubsub().await?;
        sub_conn.subscribe(REDIS_EVENTS_CHANNEL).await?;

        let server = self.server.clone();
        let handle = tokio::spawn(async move {
            let mut stream = sub_conn.on_message();
            while let Some(msg) = stream.next().await {
                let payload: String = match msg.get_payload() {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let Ok(decoded) = serde_json::from_str::<Value>(&payload) else {
                    continue;
                };
                let event = decoded
                    .get("event")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let channel_name = decoded
                    .get("channel")
                    .and_then(|v| v.as_str())
                    .unwrap_or(NO_CHANNEL);
                let message = decoded
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let exclude = decoded
                    .get("excludeUuid")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if event.is_empty() || message.is_empty() {
                    continue;
                }

                let exclude_id = exclude.and_then(|uuid| {
                    server
                        .clients
                        .read()
                        .ok()?
                        .get(&uuid)
                        .and_then(|node| node.socket.as_ref().map(|s| s.id()))
                });

                server
                    .channel(channel_name)
                    .propagate(event, message, exclude_id)
                    .await;
            }
        });
        *self.listener.lock().await = Some(handle);
        Ok(())
    }

    pub async fn publish(
        &self,
        event: &str,
        channel: &str,
        message: &str,
        exclude_uuid: Option<&str>,
    ) -> Result<(), redis::RedisError> {
        let channel_name = if channel.is_empty() { NO_CHANNEL } else { channel };
        let payload = json!({
            "event": event,
            "channel": channel_name,
            "message": message,
            "excludeUuid": exclude_uuid,
        });
        if let Some(conn) = self.publisher.lock().await.as_mut() {
            let _: i64 = conn
                .publish(REDIS_EVENTS_CHANNEL, payload.to_string())
                .await?;
        }
        Ok(())
    }

    pub async fn close(&self) {
        if let Some(handle) = self.listener.lock().await.take() {
            handle.abort();
        }
        *self.publisher.lock().await = None;
    }
}
