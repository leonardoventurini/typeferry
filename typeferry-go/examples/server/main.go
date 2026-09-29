// The example mounts TypeFerry on an application-owned HTTP server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/httptransport"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
	"github.com/leonardoventurini/typeferry/typeferry-go/websocket"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	methods := runtime.NewServer()
	if err := methods.AddMethod("example.hello", hello, runtime.MethodOptions{}); err != nil {
		return err
	}
	origins := []string{"http://localhost:8000"}
	websockets := websocket.New(methods, websocket.Options{Origins: origins})
	routes := http.NewServeMux()
	routes.Handle(protocol.HTTPPath, httptransport.New(methods, httptransport.Options{
		Origins: origins, AllowOriginless: true,
	}))
	routes.Handle(protocol.WebSocketPath, websockets)
	host := &http.Server{Addr: "127.0.0.1:8002", Handler: routes, ReadHeaderTimeout: 5 * time.Second}
	served := make(chan error, 1)
	go func() { served <- host.ListenAndServe() }()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	select {
	case <-ctx.Done():
	case err := <-served:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	// HTTP shutdown does not own upgraded WebSocket connections.
	if err := websockets.Close(); err != nil {
		return err
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := host.Shutdown(shutdown); err != nil {
		return err
	}
	return methods.Close()
}

func hello(_ context.Context, _ *runtime.Client, _ ejson.Value) (ejson.Value, error) {
	return ejson.Object(ejson.Field{Key: "message", Value: ejson.String("hello")}), nil
}
