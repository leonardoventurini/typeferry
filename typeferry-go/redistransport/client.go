package redistransport

import (
	"context"
	"errors"
	"sort"
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
	server  *runtime.Server
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
	client.server = server
	client.adapter = New(server, client)
	if err := pub.SAdd(ctx, "typeferry:servers", server.ID()).Err(); err != nil {
		server.SetEventPublisher(nil)
		cancel()
		_ = sub.Close()
		_ = pub.Close()
		return nil, err
	}
	server.SetPresenceTracker(client)
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
	client.server.SetPresenceTracker(nil)
	first := client.sub.Close()
	<-client.done
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cleanup := client.pub.Del(ctx, client.clientsKey(), client.usersKey()).Err()
	remove := client.pub.SRem(ctx, "typeferry:servers", client.server.ID()).Err()
	return errors.Join(first, cleanup, remove, client.pub.Close())
}

func (client *Client) clientsKey() string { return "typeferry:clients:" + client.server.ID() }
func (client *Client) usersKey() string   { return "typeferry:users:" + client.server.ID() }

func (client *Client) RegisterClient(node *runtime.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = client.pub.SAdd(ctx, client.clientsKey(), node.ID()).Err()
	client.refreshUsers(ctx)
}

func (client *Client) RemoveClient(node *runtime.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = client.pub.SRem(ctx, client.clientsKey(), node.ID()).Err()
	client.refreshUsers(ctx)
}

func (client *Client) RefreshClient(_ *runtime.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	client.refreshUsers(ctx)
}

func (client *Client) refreshUsers(ctx context.Context) {
	users := make(map[string]struct{})
	for _, node := range client.server.ClientSnapshot() {
		if id := node.UserID(); id != "" {
			users[id] = struct{}{}
		}
	}
	pipe := client.pub.TxPipeline()
	pipe.Del(ctx, client.usersKey())
	for id := range users {
		pipe.SAdd(ctx, client.usersKey(), id)
	}
	_, _ = pipe.Exec(ctx)
}

type Stats struct {
	ClientCount int
	UserCount   int
	Users       []string
}

func (client *Client) Stats(ctx context.Context) (Stats, error) {
	servers, err := client.pub.SMembers(ctx, "typeferry:servers").Result()
	if err != nil {
		return Stats{}, err
	}
	stats := Stats{Users: []string{}}
	unique := make(map[string]struct{})
	for _, serverID := range servers {
		clients, err := client.pub.SCard(ctx, "typeferry:clients:"+serverID).Result()
		if err != nil {
			return Stats{}, err
		}
		users, err := client.pub.SMembers(ctx, "typeferry:users:"+serverID).Result()
		if err != nil {
			return Stats{}, err
		}
		stats.ClientCount += int(clients)
		stats.UserCount += len(users)
		for _, user := range users {
			unique[user] = struct{}{}
		}
	}
	for user := range unique {
		stats.Users = append(stats.Users, user)
	}
	sort.Strings(stats.Users)
	return stats, nil
}
