package redistransport

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
	"github.com/redis/go-redis/v9"
)

type channelSocket struct{ frames chan string }

func (socket *channelSocket) SendText(_ context.Context, frame string) error {
	socket.frames <- frame
	return nil
}

func (socket *channelSocket) Close() error { return nil }

func TestRedisCrossInstanceDelivery(t *testing.T) {
	url := os.Getenv("TYPEFERRY_TEST_REDIS_URL")
	if url == "" {
		t.Skip("set TYPEFERRY_TEST_REDIS_URL to a disposable Redis instance")
	}
	options, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	first := runtime.NewServer()
	second := runtime.NewServer()
	for _, server := range []*runtime.Server{first, second} {
		if err := server.AddEvent("changed", runtime.EventOptions{Cluster: true}); err != nil {
			t.Fatal(err)
		}
	}
	firstRedis, err := Connect(ctx, first, options)
	if err != nil {
		t.Fatal(err)
	}
	defer firstRedis.Close()
	secondRedis, err := Connect(ctx, second, options)
	if err != nil {
		t.Fatal(err)
	}
	defer secondRedis.Close()
	socket := &channelSocket{frames: make(chan string, 2)}
	client := runtime.NewClient("peer")
	client.SetSocket(socket)
	second.AddClient(client)
	params := ejson.Object(ejson.Field{Key: "events", Value: ejson.Array(ejson.String("changed"))}, ejson.Field{Key: "channel", Value: ejson.String("room")})
	if _, err := second.Call(ctx, "rpc:on", params, client); err != nil {
		t.Fatal(err)
	}
	if err := first.EmitEvent(ctx, "changed", "room", ejson.Object(ejson.Field{Key: "n", Value: ejson.Int(1)})); err != nil {
		t.Fatal(err)
	}
	select {
	case frame := <-socket.frames:
		if frame == "" {
			t.Fatal("empty frame")
		}
	case <-ctx.Done():
		t.Fatal("cluster event did not arrive")
	}
}
