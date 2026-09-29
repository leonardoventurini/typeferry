package websocket

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

const PingInterval = 25 * time.Second

type Options struct {
	Origins         []string
	AllowOriginless bool
	Authenticate    HandshakeAuthenticator
	MaxMessageBytes int64
}

type Handler struct {
	server  *runtime.Server
	options Options
	origins map[string]struct{}
	mu      sync.Mutex
	sockets map[*connectionSocket]struct{}
	closed  bool
}

func New(server *runtime.Server, options Options) *Handler {
	origins := make(map[string]struct{}, len(options.Origins))
	for _, origin := range options.Origins {
		origins[origin] = struct{}{}
	}
	return &Handler{server: server, options: options, origins: origins, sockets: make(map[*connectionSocket]struct{})}
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path != protocol.WebSocketPath {
		http.NotFound(response, request)
		return
	}
	if request.Method != http.MethodGet {
		response.Header().Set("Allow", http.MethodGet)
		http.Error(response, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	origin := request.Header.Get("Origin")
	if len(handler.origins) > 0 {
		_, allowed := handler.origins[origin]
		if !allowed && !(origin == "" && handler.options.AllowOriginless) {
			http.Error(response, "Forbidden", http.StatusForbidden)
			return
		}
	}
	handler.mu.Lock()
	closed := handler.closed
	handler.mu.Unlock()
	if closed {
		http.Error(response, "Service Unavailable", http.StatusServiceUnavailable)
		return
	}
	connection, err := websocket.Accept(response, request, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	limit := handler.options.MaxMessageBytes
	if limit <= 0 {
		limit = 1 << 20
	}
	connection.SetReadLimit(limit)
	socket := &connectionSocket{connection: connection}
	handler.mu.Lock()
	if handler.closed {
		handler.mu.Unlock()
		_ = socket.Close()
		return
	}
	handler.sockets[socket] = struct{}{}
	handler.mu.Unlock()
	defer func() {
		handler.mu.Lock()
		delete(handler.sockets, socket)
		handler.mu.Unlock()
	}()
	query := make(map[string]string)
	for name, values := range request.URL.Query() {
		if len(values) > 0 {
			query[name] = values[0]
		}
	}
	headers := make(map[string]string)
	for name, values := range request.Header {
		if len(values) > 0 {
			headers[strings.ToLower(name)] = values[0]
		}
	}
	dispatcher := NewDispatcher(handler.server, socket, query, handler.options.Authenticate)
	dispatcher.SetHandshake(Handshake{Path: request.URL.Path, Headers: headers, Query: query})
	dispatcher.Client().SetRequestMetadata(headers, request.RemoteAddr, request.UserAgent())
	defer dispatcher.Close()
	if err := dispatcher.Open(request.Context()); err != nil {
		return
	}
	ctx, cancel := context.WithCancel(request.Context())
	defer cancel()
	go handler.pingLoop(ctx, dispatcher)
	for {
		kind, data, err := connection.Read(ctx)
		if err != nil {
			return
		}
		if kind == websocket.MessageText {
			dispatcher.Receive(ctx, string(data))
		}
	}
}

func (handler *Handler) pingLoop(ctx context.Context, dispatcher *Dispatcher) {
	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if dispatcher.pendingPing.Swap(true) {
				_ = dispatcher.socket.Close()
				return
			}
			if err := dispatcher.socket.SendText(ctx, `{"t":"ping"}`); err != nil {
				_ = dispatcher.socket.Close()
				return
			}
		}
	}
}

// Close terminates upgraded sockets, which net/http.Server.Shutdown does not own.
func (handler *Handler) Close() error {
	handler.mu.Lock()
	handler.closed = true
	sockets := make([]*connectionSocket, 0, len(handler.sockets))
	for socket := range handler.sockets {
		sockets = append(sockets, socket)
	}
	handler.mu.Unlock()
	for _, socket := range sockets {
		_ = socket.Close()
	}
	return nil
}

type connectionSocket struct {
	connection *websocket.Conn
	once       sync.Once
}

func (socket *connectionSocket) SendText(ctx context.Context, message string) error {
	return socket.connection.Write(ctx, websocket.MessageText, []byte(message))
}

func (socket *connectionSocket) Close() error {
	var err error
	socket.once.Do(func() { err = socket.connection.CloseNow() })
	return err
}
