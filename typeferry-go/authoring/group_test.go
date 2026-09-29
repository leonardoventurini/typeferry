package authoring

import (
	"context"
	"testing"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

func TestGroupRegistersNamesAndOverridesDefaults(t *testing.T) {
	server := runtime.NewServer()
	group := NewGroup("studio").ProtectedByDefault().CacheByDefault(time.Minute)
	calls := 0
	name, err := group.Method("secret", func(_ context.Context, _ *runtime.Client, _ ejson.Value) (ejson.Value, error) {
		calls++
		return ejson.Int(int64(calls)), nil
	}, Options{})
	if err != nil || name != "studio.secret" {
		t.Fatalf("method %q: %v", name, err)
	}
	_, err = group.Method("public", func(_ context.Context, _ *runtime.Client, _ ejson.Value) (ejson.Value, error) {
		return ejson.Bool(true), nil
	}, Options{Public: true, NoCache: true, WireName: "public.ping"})
	if err != nil {
		t.Fatal(err)
	}
	if err := group.Register(server); err != nil {
		t.Fatal(err)
	}
	if !server.HasMethod("studio.secret") || !server.HasMethod("public.ping") {
		t.Fatal("method names not registered")
	}
	client := runtime.NewClient("client")
	if _, err := server.Call(context.Background(), "studio.secret", ejson.Null(), client); err == nil {
		t.Fatal("protected default was bypassed")
	}
	if _, err := server.Call(context.Background(), "public.ping", ejson.Null(), client); err != nil {
		t.Fatal(err)
	}
	client.SetAuthenticated(true)
	for index := 0; index < 2; index++ {
		if _, err := server.Call(context.Background(), "studio.secret", ejson.Null(), client); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("cached handler called %d times", calls)
	}
}
