package websocket

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

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
