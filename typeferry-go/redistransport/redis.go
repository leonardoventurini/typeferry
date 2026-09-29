// Package redistransport carries TypeFerry cluster events over Redis pub/sub.
package redistransport

import (
	"context"
	"errors"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

type Publisher interface {
	Publish(context.Context, string, string) error
}

type Envelope struct {
	Event       string
	Channel     string
	Message     string
	ExcludeUUID string
}

func PublishEnvelope(event, channel, message, excludeUUID string) (string, string, error) {
	if channel == "" {
		channel = protocol.NoChannel
	}
	fields := []ejson.Field{
		{Key: "event", Value: ejson.String(event)},
		{Key: "channel", Value: ejson.String(channel)},
		{Key: "message", Value: ejson.String(message)},
	}
	if excludeUUID != "" {
		fields = append(fields, ejson.Field{Key: "excludeUuid", Value: ejson.String(excludeUUID)})
	}
	payload, err := ejson.NewCodec().Stringify(ejson.Object(fields...), false)
	return protocol.RedisEventsChannel, payload, err
}

func ParseEnvelope(payload string) (Envelope, error) {
	value, err := ejson.NewCodec().Parse(payload)
	if err != nil {
		return Envelope{}, err
	}
	if value.Kind() != ejson.KindObject {
		return Envelope{}, errors.New("Redis event must be an object")
	}
	read := func(key string) string {
		field, _ := value.Lookup(key)
		text, _ := field.Text()
		return text
	}
	result := Envelope{Event: read("event"), Channel: read("channel"), Message: read("message"), ExcludeUUID: read("excludeUuid")}
	if result.Event == "" || result.Message == "" {
		return Envelope{}, errors.New("Redis event is incomplete")
	}
	if result.Channel == "" {
		result.Channel = protocol.NoChannel
	}
	return result, nil
}

type Adapter struct {
	server    *runtime.Server
	publisher Publisher
}

func New(server *runtime.Server, publisher Publisher) *Adapter {
	adapter := &Adapter{server: server, publisher: publisher}
	server.SetEventPublisher(adapter)
	return adapter
}

func (adapter *Adapter) Publish(ctx context.Context, event, channel, message, excludeUUID string) error {
	redisChannel, payload, err := PublishEnvelope(event, channel, message, excludeUUID)
	if err != nil {
		return err
	}
	return adapter.publisher.Publish(ctx, redisChannel, payload)
}

func (adapter *Adapter) Receive(ctx context.Context, payload string) error {
	envelope, err := ParseEnvelope(payload)
	if err != nil {
		return err
	}
	return adapter.server.PropagateEvent(ctx, envelope.Event, envelope.Channel, envelope.Message, envelope.ExcludeUUID)
}
