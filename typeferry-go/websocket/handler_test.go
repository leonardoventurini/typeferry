package websocket

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

func TestHTTPUpgradeOriginAndRPC(t *testing.T) {
	server := runtime.NewServer()
	handler := New(server, Options{Origins: []string{"https://studio.test"}})
	host := httptest.NewServer(handler)
	defer host.Close()
	defer handler.Close()
	url := "ws" + strings.TrimPrefix(host.URL, "http") + "/typeferry-ws?uuid=browser"
	if _, _, err := websocket.Dial(context.Background(), url, nil); err == nil {
		t.Fatal("missing origin was accepted")
	}
	connection, _, err := websocket.Dial(context.Background(), url, &websocket.DialOptions{HTTPHeader: map[string][]string{"Origin": {"https://studio.test"}}})
	if err != nil {
		t.Fatal(err)
	}
	defer connection.CloseNow()
	_, frame, err := connection.Read(context.Background())
	if err != nil || string(frame) != `{"t":"auth","authenticated":false}` {
		t.Fatalf("auth frame %s: %v", frame, err)
	}
	if err := connection.Write(context.Background(), websocket.MessageText, []byte(`{"t":"rpc","id":"x","method":"missing"}`)); err != nil {
		t.Fatal(err)
	}
	_, frame, err = connection.Read(context.Background())
	if err != nil || string(frame) != `{"t":"rpc:res","id":"x","error":"Method Not Found"}` {
		t.Fatalf("RPC frame %s: %v", frame, err)
	}
	if err := handler.Close(); err != nil {
		t.Fatal(err)
	}
	readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, _, err := connection.Read(readCtx); err == nil {
		t.Fatal("shutdown left upgraded socket open")
	}
}

func TestCancelledAuthenticationCannotAuthenticateLater(t *testing.T) {
	server := runtime.NewServer()
	socket := &fixtureSocket{}
	auth := func(ctx context.Context, _ *runtime.Client, _ Handshake) (ejson.Value, error) {
		<-ctx.Done()
		return ejson.Object(ejson.Field{Key: "user", Value: ejson.Object(ejson.Field{Key: "_id", Value: ejson.String("late")})}), nil
	}
	dispatcher := NewDispatcher(server, socket, nil, auth)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := dispatcher.Open(ctx); err != nil {
		t.Fatal(err)
	}
	if dispatcher.Client().Authenticated() {
		t.Fatal("late result authenticated a cancelled connection")
	}
	if got := socket.next(t); got["authenticated"] != false {
		t.Fatalf("auth frame: %v", got)
	}
}

func TestAuthenticationTimeoutIgnoresLateResult(t *testing.T) {
	server := runtime.NewServer()
	socket := &fixtureSocket{}
	release := make(chan struct{})
	dispatcher := NewDispatcher(server, socket, nil, func(context.Context, *runtime.Client, Handshake) (ejson.Value, error) {
		<-release
		return ejson.Object(ejson.Field{Key: "user", Value: ejson.String("late")}), nil
	})
	dispatcher.authTimeout = 10 * time.Millisecond
	if err := dispatcher.Open(context.Background()); err != nil {
		t.Fatal(err)
	}
	close(release)
	if frame := socket.next(t); frame["authenticated"] != false {
		t.Fatalf("timeout auth frame = %v", frame)
	}
	if dispatcher.Client().Authenticated() {
		t.Fatal("late auth result changed client")
	}
}

func TestClientPingReceivesPong(t *testing.T) {
	server := runtime.NewServer()
	socket := &fixtureSocket{}
	dispatcher := NewDispatcher(server, socket, nil, nil)
	if err := dispatcher.Open(context.Background()); err != nil {
		t.Fatal(err)
	}
	socket.next(t)
	dispatcher.Receive(context.Background(), `{"t":"ping"}`)
	if frame := socket.next(t); frame["t"] != "pong" {
		t.Fatalf("frame = %v", frame)
	}
}

func TestHandshakeAuthRejectsWithoutTokenFallback(t *testing.T) {
	server := runtime.NewServer()
	if err := server.SetAuth(func(_ context.Context, _ *runtime.Client, _ ejson.Value) (ejson.Value, error) {
		return ejson.Object(ejson.Field{Key: "user", Value: ejson.String("token-user")}), nil
	}, func(context.Context, *runtime.Client, ejson.Value) (ejson.Value, error) { return ejson.Bool(true), nil }); err != nil {
		t.Fatal(err)
	}
	socket := &fixtureSocket{}
	dispatcher := NewDispatcher(server, socket, map[string]string{"token": "good"}, func(context.Context, *runtime.Client, Handshake) (ejson.Value, error) { return ejson.Null(), nil })
	if err := dispatcher.Open(context.Background()); err != nil {
		t.Fatal(err)
	}
	if frame := socket.next(t); frame["authenticated"] != false {
		t.Fatalf("handshake fallback: %v", frame)
	}
}

func TestRPCConnectionRateLimit(t *testing.T) {
	server := runtime.NewServer()
	if err := server.AddMethod("echo", func(_ context.Context, _ *runtime.Client, value ejson.Value) (ejson.Value, error) { return value, nil }, runtime.MethodOptions{}); err != nil {
		t.Fatal(err)
	}
	socket := &fixtureSocket{}
	dispatcher := NewDispatcher(server, socket, nil, nil)
	dispatcher.SetRateLimit(1, time.Minute)
	if err := dispatcher.Open(context.Background()); err != nil {
		t.Fatal(err)
	}
	socket.next(t)
	dispatcher.Receive(context.Background(), `{"t":"rpc","id":"one","method":"echo","params":1}`)
	if frame := socket.next(t); frame["result"] != float64(1) {
		t.Fatalf("first response = %v", frame)
	}
	dispatcher.Receive(context.Background(), `{"t":"rpc","id":"two","method":"echo","params":2}`)
	if frame := socket.next(t); frame["error"] != "Rate Limit Exceeded" {
		t.Fatalf("limit response = %v", frame)
	}
	dispatcher.Receive(context.Background(), `{"t":"rpc:void","method":"echo","params":3}`)
	if !socket.empty() {
		t.Fatal("void rate-limit response was not silent")
	}
}
