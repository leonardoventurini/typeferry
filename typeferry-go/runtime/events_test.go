package runtime

import (
	"context"
	"sync"
	"testing"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
)

type recordingSocket struct {
	mu     sync.Mutex
	sent   []string
	closed bool
}

func (socket *recordingSocket) SendText(_ context.Context, message string) error {
	socket.mu.Lock()
	defer socket.mu.Unlock()
	socket.sent = append(socket.sent, message)
	return nil
}

func (socket *recordingSocket) Close() error {
	socket.mu.Lock()
	defer socket.mu.Unlock()
	socket.closed = true
	return nil
}

func TestEventSubscriptionAndOriginatorExclusion(t *testing.T) {
	server := NewServer()
	if err := server.AddEvent("changed", EventOptions{ExcludeOriginator: true}); err != nil {
		t.Fatal(err)
	}
	firstSocket := &recordingSocket{}
	secondSocket := &recordingSocket{}
	first := NewClient("first")
	second := NewClient("second")
	first.SetSocket(firstSocket)
	second.SetSocket(secondSocket)
	server.AddClient(first)
	server.AddClient(second)
	params := ejson.Object(
		ejson.Field{Key: "events", Value: ejson.Array(ejson.String("changed"))},
		ejson.Field{Key: "channel", Value: ejson.String("room")},
	)
	for _, client := range []*Client{first, second} {
		result, err := server.Call(context.Background(), protocol.MethodOn, params, client)
		if err != nil {
			t.Fatal(err)
		}
		allowed, _ := result.Lookup("changed")
		if value, _ := allowed.Boolean(); !value {
			t.Fatal("subscription rejected")
		}
	}
	if err := server.EmitEvent(context.Background(), "changed", "room", ejson.Object(
		ejson.Field{Key: "uuid", Value: ejson.String("first")},
		ejson.Field{Key: "n", Value: ejson.Int(1)},
	)); err != nil {
		t.Fatal(err)
	}
	if len(firstSocket.sent) != 0 || len(secondSocket.sent) != 1 {
		t.Fatalf("event delivery: first %d, second %d", len(firstSocket.sent), len(secondSocket.sent))
	}
	if _, err := server.Call(context.Background(), protocol.MethodOff, params, second); err != nil {
		t.Fatal(err)
	}
	if err := server.EmitEvent(context.Background(), "changed", "room", ejson.Null()); err != nil {
		t.Fatal(err)
	}
	if len(secondSocket.sent) != 1 {
		t.Fatal("unsubscribed client received event")
	}
}

func TestDuplicateClientReplacementAndStaleRemoval(t *testing.T) {
	server := NewServer()
	oldSocket := &recordingSocket{}
	newSocket := &recordingSocket{}
	old := NewClient("same")
	replacement := NewClient("same")
	old.SetSocket(oldSocket)
	replacement.SetSocket(newSocket)
	server.AddClient(old)
	server.AddClient(replacement)
	server.DeleteClient(old)
	if !oldSocket.closed {
		t.Fatal("displaced socket stayed open")
	}
	if server.Client("same") != replacement {
		t.Fatal("stale close removed replacement")
	}
	server.DeleteClient(replacement)
	if server.Client("same") != nil {
		t.Fatal("client remains registered")
	}
}

type recordingPublisher struct {
	event, channel, message, exclude string
}

func (publisher *recordingPublisher) Publish(_ context.Context, event, channel, message, exclude string) error {
	publisher.event, publisher.channel, publisher.message, publisher.exclude = event, channel, message, exclude
	return nil
}

func TestClusterEventPublishesThenRoutesInbound(t *testing.T) {
	server := NewServer()
	publisher := &recordingPublisher{}
	server.SetEventPublisher(publisher)
	if err := server.AddEvent("changed", EventOptions{Cluster: true, ExcludeOriginator: true}); err != nil {
		t.Fatal(err)
	}
	socket := &recordingSocket{}
	client := NewClient("peer")
	client.SetSocket(socket)
	server.AddClient(client)
	params := ejson.Object(ejson.Field{Key: "events", Value: ejson.Array(ejson.String("changed"))})
	if _, err := server.Call(context.Background(), protocol.MethodOn, params, client); err != nil {
		t.Fatal(err)
	}
	if err := server.EmitEvent(context.Background(), "changed", protocol.NoChannel, ejson.Object(ejson.Field{Key: "uuid", Value: ejson.String("origin")})); err != nil {
		t.Fatal(err)
	}
	if publisher.event != "changed" || publisher.channel != protocol.NoChannel || publisher.exclude != "origin" || publisher.message == "" {
		t.Fatalf("cluster publish = %#v", publisher)
	}
	if len(socket.sent) != 0 {
		t.Fatal("published cluster event delivered twice")
	}
	if err := server.PropagateEvent(context.Background(), "changed", protocol.NoChannel, publisher.message, publisher.exclude); err != nil {
		t.Fatal(err)
	}
	if len(socket.sent) != 1 {
		t.Fatal("inbound cluster event did not reach local subscriber")
	}
}

func TestUserEventCustomSubscriptionPredicateOverridesDefaultChannel(t *testing.T) {
	server := NewServer()
	if err := server.AddEvent("custom", EventOptions{User: true, ShouldSubscribe: func(*Client, string, string) bool { return true }}); err != nil {
		t.Fatal(err)
	}
	client := NewClient("client")
	client.SetSocket(&recordingSocket{})
	client.SetAuthenticated(true)
	client.SetContext(ejson.Object(ejson.Field{Key: "user", Value: ejson.Object(ejson.Field{Key: "_id", Value: ejson.String("user")})}))
	server.AddClient(client)
	params := ejson.Object(ejson.Field{Key: "events", Value: ejson.Array(ejson.String("custom"))}, ejson.Field{Key: "channel", Value: ejson.String("other")})
	result, err := server.Call(context.Background(), protocol.MethodOn, params, client)
	if err != nil {
		t.Fatal(err)
	}
	value, _ := result.Lookup("custom")
	allowed, _ := value.Boolean()
	if !allowed {
		t.Fatal("custom predicate did not override user channel rule")
	}
}
