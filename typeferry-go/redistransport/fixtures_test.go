package redistransport

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

type redisFixture struct {
	Publish *struct {
		Event       string `json:"event"`
		Channel     string `json:"channel"`
		Message     string `json:"message"`
		ExcludeUUID string `json:"exclude_uuid"`
	} `json:"publish"`
	ExpectedChannel string         `json:"expected_redis_channel"`
	ExpectedPayload map[string]any `json:"expected_payload_decoded"`
	IncomingPayload string         `json:"incoming_payload"`
	ExpectedRoute   struct {
		Channel     string `json:"channel"`
		Event       string `json:"event"`
		Payload     string `json:"payload"`
		ExcludeUUID string `json:"exclude_uuid"`
	} `json:"expected_propagate_call"`
}

func TestSharedRedisFixtures(t *testing.T) {
	paths, err := filepath.Glob("../../docs/conformance/fixtures/redis/*.case.json")
	if err != nil || len(paths) == 0 {
		t.Fatalf("Redis fixtures: %v", err)
	}
	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var fixture redisFixture
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			if fixture.Publish != nil {
				channel, payload, err := PublishEnvelope(fixture.Publish.Event, fixture.Publish.Channel, fixture.Publish.Message, fixture.Publish.ExcludeUUID)
				if err != nil {
					t.Fatal(err)
				}
				var decoded map[string]any
				if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
					t.Fatal(err)
				}
				if channel != fixture.ExpectedChannel || !reflect.DeepEqual(decoded, fixture.ExpectedPayload) {
					t.Fatalf("publish %q %#v, want %q %#v", channel, decoded, fixture.ExpectedChannel, fixture.ExpectedPayload)
				}
			}
			if fixture.IncomingPayload != "" {
				route, err := ParseEnvelope(fixture.IncomingPayload)
				if err != nil {
					t.Fatal(err)
				}
				if route.Event != fixture.ExpectedRoute.Event || route.Channel != fixture.ExpectedRoute.Channel || route.Message != fixture.ExpectedRoute.Payload || route.ExcludeUUID != fixture.ExpectedRoute.ExcludeUUID {
					t.Fatalf("route %#v, want %#v", route, fixture.ExpectedRoute)
				}
			}
		})
	}
}

type fakePublisher struct{ channel, payload string }

func (fake *fakePublisher) Publish(_ context.Context, channel, payload string) error {
	fake.channel, fake.payload = channel, payload
	return nil
}

func TestClusterAdapterPublishes(t *testing.T) {
	server := runtime.NewServer()
	fake := &fakePublisher{}
	adapter := New(server, fake)
	if err := adapter.Publish(context.Background(), "changed", "room", `{"t":"event"}`, "peer"); err != nil {
		t.Fatal(err)
	}
	if fake.channel != "events" {
		t.Fatalf("channel = %q", fake.channel)
	}
	route, err := ParseEnvelope(fake.payload)
	if err != nil || route.ExcludeUUID != "peer" {
		t.Fatalf("route = %#v, %v", route, err)
	}
}
