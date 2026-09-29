package websocket

import (
	"context"
	"testing"

	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

func FuzzReceiveMalformedFrames(f *testing.F) {
	for _, seed := range []string{"", "null", "{}", `{"t":"rpc"}`, `{"t":"ping"}`, `{"t":"rpc:void","method":42}`, "\xff\x00"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, payload string) {
		server := runtime.NewServer()
		socket := &fixtureSocket{}
		dispatcher := NewDispatcher(server, socket, nil, nil)
		if err := dispatcher.Open(context.Background()); err != nil {
			t.Fatal(err)
		}
		dispatcher.Receive(context.Background(), payload)
		dispatcher.Close()
	})
}
