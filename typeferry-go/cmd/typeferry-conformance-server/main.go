package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/httptransport"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
	"github.com/leonardoventurini/typeferry/typeferry-go/websocket"
)

func main() {
	server := runtime.NewServer()
	register(server, "add", func(_ context.Context, _ *runtime.Client, params ejson.Value) (ejson.Value, error) {
		left, _ := params.Lookup("a")
		right, _ := params.Lookup("b")
		a, _ := left.Integer()
		b, _ := right.Integer()
		return ejson.Int(a + b), nil
	}, runtime.MethodOptions{})
	register(server, "echo", func(_ context.Context, _ *runtime.Client, params ejson.Value) (ejson.Value, error) {
		return params, nil
	}, runtime.MethodOptions{})
	register(server, "whoami", func(_ context.Context, client *runtime.Client, _ ejson.Value) (ejson.Value, error) {
		return ejson.String(client.UserID()), nil
	}, runtime.MethodOptions{Protected: true})
	if err := server.AddEvent("ping.tick", runtime.EventOptions{}); err != nil {
		log.Fatal(err)
	}
	register(server, "emit_ping", func(ctx context.Context, _ *runtime.Client, params ejson.Value) (ejson.Value, error) {
		channel, _ := params.Lookup("channel")
		name, _ := channel.Text()
		value, _ := params.Lookup("params")
		return ejson.Bool(true), server.EmitEvent(ctx, "ping.tick", name, value)
	}, runtime.MethodOptions{})
	if err := server.SetAuth(func(_ context.Context, _ *runtime.Client, input ejson.Value) (ejson.Value, error) {
		token, _ := input.Lookup("token")
		text, _ := token.Text()
		if text != "good-token" {
			return ejson.Null(), nil
		}
		return ejson.Object(ejson.Field{Key: "user", Value: ejson.Object(ejson.Field{Key: "_id", Value: ejson.String("u1")})}), nil
	}, func(context.Context, *runtime.Client, ejson.Value) (ejson.Value, error) {
		return ejson.Bool(true), nil
	}); err != nil {
		log.Fatal(err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle(protocol.HTTPPath, httptransport.New(server, httptransport.Options{DisableRateLimit: true}))
	ws := websocket.New(server, websocket.Options{})
	defer ws.Close()
	mux.Handle(protocol.WebSocketPath, ws)
	fmt.Fprintf(os.Stderr, "TYPEFERRY_PORT=%d\n", listener.Addr().(*net.TCPAddr).Port)
	if err := http.Serve(listener, mux); err != nil {
		log.Fatal(err)
	}
}

func register(server *runtime.Server, name string, handler runtime.Handler, options runtime.MethodOptions) {
	if err := server.AddMethod(name, handler, options); err != nil {
		log.Fatal(err)
	}
}
