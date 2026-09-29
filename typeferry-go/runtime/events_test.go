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
