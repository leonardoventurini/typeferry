package redistransport

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
	"github.com/redis/go-redis/v9"
)

// Client owns dedicated Redis publish and subscribe connections. Subscribe
// readiness is checked before Connect returns so the first event is not lost.
type Client struct {
	adapter *Adapter
	pub     *redis.Client
	sub     *redis.PubSub
	cancel  context.CancelFunc
	done    chan struct{}
	mu      sync.Mutex
	closed  bool
}

func Connect(ctx context.Context, server *runtime.Server, options *redis.Options) (*Client, error) {
	if server == nil || options == nil {
		return nil, errors.New("Redis transport requires a server and options")
	}
	pub := redis.NewClient(options)
	if err := pub.Ping(ctx).Err(); err != nil {
		_ = pub.Close()
		return nil, err
	}
	sub := pub.Subscribe(ctx, protocol.RedisEventsChannel)
	if _, err := sub.Receive(ctx); err != nil {
		_ = sub.Close()
		_ = pub.Close()
		return nil, err
	}
	listenCtx, cancel := context.WithCancel(context.Background())
	client := &Client{pub: pub, sub: sub, cancel: cancel, done: make(chan struct{})}
	client.adapter = New(server, client)
	go client.listen(listenCtx)
	return client, nil
}

func (client *Client) Publish(ctx context.Context, channel, payload string) error {
	return client.pub.Publish(ctx, channel, payload).Err()
}

func (client *Client) listen(ctx context.Context) {
	defer close(client.done)
	for {
		message, err := client.sub.ReceiveMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			// Redis subscriptions reconnect internally. A persistent failure
			// should not spin or pin a CPU while the connection recovers.
			select {
			case <-ctx.Done():
				return
			case <-time.After(100 * time.Millisecond):
			}
			continue
		}
		_ = client.adapter.Receive(ctx, message.Payload)
	}
}

func (client *Client) Close() error {
	client.mu.Lock()
	if client.closed {
		client.mu.Unlock()
		return nil
	}
	client.closed = true
	client.mu.Unlock()
	client.cancel()
	client.adapter.server.SetEventPublisher(nil)
	first := client.sub.Close()
	<-client.done
	return errors.Join(first, client.pub.Close())
}
