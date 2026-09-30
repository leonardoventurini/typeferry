package runtime

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
)

func TestClosedServerRejectsNewWorkAndClients(t *testing.T) {
	server := NewServer()
	called := false
	if err := server.AddMethod("work", func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		called = true
		return ejson.Null(), nil
	}, MethodOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := server.SetAuth(func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		called = true
		return ejson.Object(), nil
	}, func(context.Context, *Client, ejson.Value) (ejson.Value, error) { return ejson.Null(), nil }); err != nil {
		t.Fatal(err)
	}
	if err := server.AddEvent("changed", EventOptions{Cluster: true}); err != nil {
		t.Fatal(err)
	}
	publisher := &recordingPublisher{}
	server.SetEventPublisher(publisher)
	if err := server.Close(); err != nil {
		t.Fatal(err)
	}
	client := NewClient("late")
	socket := &recordingSocket{}
	client.SetSocket(socket)
	server.AddClient(client)
	if server.Client(client.ID()) != nil || !socket.closed {
		t.Fatal("closed runtime accepted a live client")
	}
	if _, err := server.Call(context.Background(), "work", ejson.Null(), client); !errors.Is(err, ErrClosed) {
		t.Fatal("closed runtime called a method")
	}
	if _, err := server.AuthenticateValue(context.Background(), client, ejson.Null()); !errors.Is(err, ErrClosed) {
		t.Fatal("closed runtime authenticated a client")
	}
	if err := server.AddMethod("late", func(context.Context, *Client, ejson.Value) (ejson.Value, error) { return ejson.Null(), nil }, MethodOptions{}); !errors.Is(err, ErrClosed) {
		t.Fatal("closed runtime registered a method")
	}
	if err := server.AddEvent("late", EventOptions{}); !errors.Is(err, ErrClosed) {
		t.Fatal("closed runtime registered an event")
	}
	if err := server.EmitEvent(context.Background(), "changed", "room", ejson.Null()); !errors.Is(err, ErrClosed) || publisher.event != "" {
		t.Fatal("closed runtime published an event")
	}
	if called {
		t.Fatal("application work executed after close")
	}
}

func TestSubscriptionAuthorizationCannotRepopulateClosedRooms(t *testing.T) {
	server := NewServer()
	entered, release := make(chan struct{}), make(chan struct{})
	if err := server.AddEvent("changed", EventOptions{ShouldSubscribe: func(*Client, string, string) bool { close(entered); <-release; return true }}); err != nil {
		t.Fatal(err)
	}
	client := NewClient("subscriber")
	client.SetSocket(&recordingSocket{})
	server.AddClient(client)
	done := make(chan struct{})
	go func() {
		_, _ = server.Call(context.Background(), protocol.MethodOn, ejson.Object(ejson.Field{Key: "events", Value: ejson.Array(ejson.String("changed"))}, ejson.Field{Key: "channel", Value: ejson.String("room")}), client)
		close(done)
	}()
	<-entered
	if err := server.Close(); err != nil {
		t.Fatal(err)
	}
	close(release)
	<-done
	if server.RoomSize("room", "changed") != 0 {
		t.Fatal("late authorization restored a closed room")
	}
}

type joiningSocket struct {
	entered, release chan struct{}
	err              error
}

func (socket *joiningSocket) SendText(context.Context, string) error { return nil }
func (socket *joiningSocket) Close() error {
	close(socket.entered)
	<-socket.release
	return socket.err
}

func TestConcurrentServerClosersJoinAndRetainSocketFailure(t *testing.T) {
	server := NewServer()
	failure := errors.New("socket close failed")
	socket := &joiningSocket{entered: make(chan struct{}), release: make(chan struct{}), err: failure}
	client := NewClient("blocked")
	client.SetSocket(socket)
	server.AddClient(client)
	first, second := make(chan error, 1), make(chan error, 1)
	go func() { first <- server.Close() }()
	<-socket.entered
	go func() { second <- server.Close() }()
	select {
	case <-second:
		t.Fatal("concurrent close skipped retirement")
	case <-time.After(20 * time.Millisecond):
	}
	close(socket.release)
	if err := <-first; !errors.Is(err, failure) {
		t.Fatalf("first close = %v", err)
	}
	if err := <-second; !errors.Is(err, failure) {
		t.Fatalf("second close = %v", err)
	}
}

type trackedPresence struct {
	mu     sync.Mutex
	active map[string]bool
}

func (tracker *trackedPresence) RegisterClient(client *Client) {
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	tracker.active[client.ID()] = true
}
func (tracker *trackedPresence) RemoveClient(client *Client) {
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	delete(tracker.active, client.ID())
}
func (*trackedPresence) RefreshClient(*Client) {}

func TestServerCloseRemovesPresenceAndRacingAdmissions(t *testing.T) {
	server := NewServer()
	tracker := &trackedPresence{active: make(map[string]bool)}
	server.SetPresenceTracker(tracker)
	var pending sync.WaitGroup
	for range 100 {
		pending.Go(func() { client := NewClient(""); client.SetSocket(&recordingSocket{}); server.AddClient(client) })
	}
	pending.Go(func() { _ = server.Close() })
	pending.Wait()
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	if len(tracker.active) != 0 || len(server.ClientSnapshot()) != 0 {
		t.Fatalf("retained presence=%d clients=%d", len(tracker.active), len(server.ClientSnapshot()))
	}
}
