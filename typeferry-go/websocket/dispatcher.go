// Package websocket adapts TypeFerry's transport-neutral runtime to text frames.
package websocket

import (
	"context"
	"errors"
	"regexp"
	"sync"
	"sync/atomic"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

const AuthenticationTimeout = 5 * time.Second

var validID = regexp.MustCompile(`[^a-zA-Z0-9-]`)

type Handshake struct {
	Path    string
	Headers map[string]string
	Query   map[string]string
}

type HandshakeAuthenticator func(context.Context, *runtime.Client, Handshake) (ejson.Value, error)

// Dispatcher owns one connection's protocol state. The socket must serialize
// concurrent writes; the HTTP adapter provides that guarantee.
type Dispatcher struct {
	server      *runtime.Server
	socket      runtime.Socket
	client      *runtime.Client
	query       map[string]string
	handshake   Handshake
	auth        HandshakeAuthenticator
	pendingPing atomic.Bool
	limit       *rateLimiter
	authTimeout time.Duration
}

type rateLimiter struct {
	mu       sync.Mutex
	capacity float64
	tokens   float64
	interval time.Duration
	last     time.Time
}

func (limit *rateLimiter) take() bool {
	limit.mu.Lock()
	defer limit.mu.Unlock()
	now := time.Now()
	limit.tokens += now.Sub(limit.last).Seconds() / limit.interval.Seconds() * limit.capacity
	if limit.tokens > limit.capacity {
		limit.tokens = limit.capacity
	}
	limit.last = now
	if limit.tokens < 1 {
		return false
	}
	limit.tokens--
	return true
}

func (dispatcher *Dispatcher) SetRateLimit(max int, interval time.Duration) {
	if max > 0 && interval > 0 {
		dispatcher.limit = &rateLimiter{capacity: float64(max), tokens: float64(max), interval: interval, last: time.Now()}
	}
}

func NewDispatcher(server *runtime.Server, socket runtime.Socket, query map[string]string, auth HandshakeAuthenticator) *Dispatcher {
	id := query["uuid"]
	if len(id) > 64 {
		id = ""
	} else {
		id = validID.ReplaceAllString(id, "")
	}
	client := runtime.NewClient(id)
	client.SetSocket(socket)
	meta := ejson.Object()
	if raw := query["meta"]; len(raw) <= 10000 && raw != "" {
		if parsed, err := server.Codec().Parse(raw); err == nil && parsed.Kind() == ejson.KindObject {
			meta = parsed
		}
	}
	client.SetMeta(meta)
	return &Dispatcher{server: server, socket: socket, client: client, query: query, auth: auth, authTimeout: AuthenticationTimeout}
}

func (dispatcher *Dispatcher) Client() *runtime.Client { return dispatcher.client }

func (dispatcher *Dispatcher) SetHandshake(handshake Handshake) {
	dispatcher.handshake = handshake
}

func (dispatcher *Dispatcher) Open(ctx context.Context) error {
	dispatcher.server.AddClient(dispatcher.client)
	if dispatcher.auth == nil && (!dispatcher.server.HasAuth() || dispatcher.query["token"] == "") {
		return dispatcher.send(ctx, ejson.Field{Key: "t", Value: ejson.String(protocol.MessageAuth)}, ejson.Field{Key: "authenticated", Value: ejson.Bool(false)})
	}
	authCtx, cancel := context.WithTimeout(ctx, dispatcher.authTimeout)
	defer cancel()
	type authResult struct {
		identity ejson.Value
		err      error
	}
	result := make(chan authResult, 1)
	go func() {
		if dispatcher.auth != nil {
			identity, err := dispatcher.auth(authCtx, dispatcher.client, dispatcher.handshake)
			result <- authResult{identity: identity, err: err}
			return
		}
		identity, err := dispatcher.server.AuthenticateValue(authCtx, dispatcher.client, ejson.Object(ejson.Field{Key: "token", Value: ejson.String(dispatcher.query["token"])}))
		result <- authResult{identity: identity, err: err}
	}()
	select {
	case <-authCtx.Done():
	case auth := <-result:
		if auth.err == nil && authCtx.Err() == nil {
			acceptIdentity(dispatcher.client, auth.identity)
			dispatcher.server.RefreshClientPresence(dispatcher.client)
		}
	}
	return dispatcher.send(ctx, ejson.Field{Key: "t", Value: ejson.String(protocol.MessageAuth)}, ejson.Field{Key: "authenticated", Value: ejson.Bool(dispatcher.client.Authenticated())})
}

func acceptIdentity(client *runtime.Client, identity ejson.Value) {
	accepted := identity.Kind() != ejson.KindNull
	if boolean, ok := identity.Boolean(); ok && !boolean {
		accepted = false
	}
	client.SetAuthenticated(accepted)
	if accepted {
		client.SetContext(identity)
	} else {
		client.SetContext(ejson.Null())
	}
}

func (dispatcher *Dispatcher) Receive(ctx context.Context, text string) {
	frame, err := dispatcher.server.Codec().Parse(text)
	if err != nil || frame.Kind() != ejson.KindObject {
		return
	}
	kind, _ := fieldText(frame, "t")
	switch kind {
	case protocol.MessagePing:
		_ = dispatcher.send(ctx, ejson.Field{Key: "t", Value: ejson.String(protocol.MessagePong)})
	case protocol.MessagePong:
		dispatcher.pendingPing.Store(false)
	case protocol.MessageRPC, protocol.MessageRPCVoid:
		if dispatcher.limit != nil && !dispatcher.limit.take() {
			if kind == protocol.MessageRPC {
				id, _ := fieldText(frame, "id")
				_ = dispatcher.send(ctx, ejson.Field{Key: "t", Value: ejson.String(protocol.MessageRPCResponse)},
					ejson.Field{Key: "id", Value: ejson.String(id)},
					ejson.Field{Key: "error", Value: ejson.String(protocol.ErrorRateLimit)})
			}
			return
		}
		method, _ := fieldText(frame, "method")
		params, ok := frame.Lookup("params")
		if !ok {
			params = ejson.Null()
		}
		result, callError := dispatcher.server.Call(ctx, method, params, dispatcher.client)
		if kind == protocol.MessageRPCVoid {
			return
		}
		id, _ := fieldText(frame, "id")
		fields := []ejson.Field{{Key: "t", Value: ejson.String(protocol.MessageRPCResponse)}, {Key: "id", Value: ejson.String(id)}}
		if callError == nil {
			fields = append(fields, ejson.Field{Key: "result", Value: result})
		} else {
			message := protocol.ErrorInternal
			var public runtime.PublicError
			var validation *runtime.SchemaValidationError
			if errors.As(callError, &public) || errors.As(callError, &validation) {
				message = callError.Error()
			}
			fields = append(fields, ejson.Field{Key: "error", Value: ejson.String(message)})
			if validation != nil {
				values := make([]ejson.Value, len(validation.Errors()))
				for index, issue := range validation.Errors() {
					values[index] = ejson.String(issue)
				}
				fields = append(fields, ejson.Field{Key: "errors", Value: ejson.Array(values...)})
			}
		}
		_ = dispatcher.send(ctx, fields...)
	}
}

func fieldText(value ejson.Value, name string) (string, bool) {
	field, ok := value.Lookup(name)
	if !ok {
		return "", false
	}
	return field.Text()
}

func (dispatcher *Dispatcher) send(ctx context.Context, fields ...ejson.Field) error {
	frame, err := dispatcher.server.Codec().Stringify(ejson.Object(fields...), false)
	if err != nil {
		return err
	}
	return dispatcher.socket.SendText(ctx, frame)
}

func (dispatcher *Dispatcher) Close() {
	dispatcher.server.DeleteClient(dispatcher.client)
	_ = dispatcher.socket.Close()
}
