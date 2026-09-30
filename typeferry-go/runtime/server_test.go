package runtime

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
)

func TestValidationPrecedesMiddlewareAndHandler(t *testing.T) {
	server := NewServer()
	invoked := false
	err := server.AddMethod("validate", func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		invoked = true
		return ejson.Null(), nil
	}, MethodOptions{
		Validate: func(ejson.Value) (ejson.Value, []ValidationIssue) {
			return ejson.Null(), []ValidationIssue{{Path: []string{"name"}, Message: "required"}}
		},
		Middleware: []Middleware{func(_ context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
			invoked = true
			return value, nil
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = server.Call(context.Background(), "validate", ejson.Null(), NewClient("c1"))
	var validation *SchemaValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if validation.Error() != "Invalid Params: name: required" {
		t.Fatal(validation)
	}
	if invoked {
		t.Fatal("validation invoked middleware or handler")
	}
}

func TestConcurrentCachedCallsShareInFlightResult(t *testing.T) {
	server := NewServer()
	started := make(chan struct{})
	release := make(chan struct{})
	calls := 0
	if err := server.AddMethod("slow", func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		calls++
		close(started)
		<-release
		return ejson.Int(7), nil
	}, MethodOptions{Cache: true}); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			value, err := server.Call(context.Background(), "slow", ejson.Int(1), nil)
			if err != nil {
				t.Error(err)
				return
			}
			if number, _ := value.Integer(); number != 7 {
				t.Errorf("result = %d", number)
			}
		}()
	}
	<-started
	close(release)
	group.Wait()
	if calls != 1 {
		t.Fatalf("handler called %d times", calls)
	}
}

func TestMiddlewareOrderAndExecutionContext(t *testing.T) {
	server := NewServer()
	client := NewClient("c1")
	client.SetContext(ejson.Object(ejson.Field{Key: "trace", Value: ejson.String("outer")}))
	var observed Execution
	err := server.AddMethod("calculate", func(ctx context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
		observed, _ = CurrentExecution(ctx)
		number, _ := value.Integer()
		return ejson.Int(number), nil
	}, MethodOptions{Middleware: []Middleware{
		func(_ context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
			number, _ := value.Integer()
			return ejson.Int(number + 1), nil
		},
		func(_ context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
			number, _ := value.Integer()
			return ejson.Int(number * 2), nil
		},
	}})
	if err != nil {
		t.Fatal(err)
	}

	result, err := server.Call(context.Background(), "calculate", ejson.Int(1), client)
	if err != nil {
		t.Fatal(err)
	}
	if number, _ := result.Integer(); number != 4 {
		t.Fatalf("result = %d", number)
	}
	if observed.ID == "" || observed.ClientContext.Kind() != ejson.KindObject {
		t.Fatalf("execution = %#v", observed)
	}
}

func TestCacheKeyPreservesObjectOrder(t *testing.T) {
	server := NewServer()
	calls := 0
	err := server.AddMethod("cached", func(_ context.Context, _ *Client, _ ejson.Value) (ejson.Value, error) {
		calls++
		return ejson.Int(int64(calls)), nil
	}, MethodOptions{Cache: true, MaxAge: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	first := ejson.Object(ejson.Field{Key: "a", Value: ejson.Int(1)}, ejson.Field{Key: "b", Value: ejson.Int(2)})
	second := ejson.Object(ejson.Field{Key: "b", Value: ejson.Int(2)}, ejson.Field{Key: "a", Value: ejson.Int(1)})
	for _, params := range []ejson.Value{first, first, second} {
		if _, err := server.Call(context.Background(), "cached", params, nil); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 2 {
		t.Fatalf("handler calls = %d", calls)
	}
}

func TestValidatedAndMiddlewareParamsReachHandlerAndCache(t *testing.T) {
	server := NewServer()
	calls := 0
	err := server.AddMethod("normalized", func(_ context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
		calls++
		return value, nil
	}, MethodOptions{
		Cache: true,
		Validate: func(_ ejson.Value) (ejson.Value, []ValidationIssue) {
			return ejson.Int(3), nil
		},
		Middleware: []Middleware{func(_ context.Context, _ *Client, value ejson.Value) (ejson.Value, error) {
			number, _ := value.Integer()
			return ejson.Int(number + 1), nil
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []ejson.Value{ejson.String("first"), ejson.String("second")} {
		result, err := server.Call(context.Background(), "normalized", input, nil)
		if err != nil {
			t.Fatal(err)
		}
		if number, _ := result.Integer(); number != 4 {
			t.Fatalf("result = %d", number)
		}
	}
	if calls != 1 {
		t.Fatalf("handler calls = %d, want 1", calls)
	}
}

func TestProtectedMethodFailsClosed(t *testing.T) {
	server := NewServer()
	err := server.AddMethod("secret", func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		return ejson.Bool(true), nil
	}, MethodOptions{Protected: true})
	if err != nil {
		t.Fatal(err)
	}
	_, err = server.Call(context.Background(), "secret", ejson.Null(), nil)
	if err == nil || err.Error() != "Method Forbidden" {
		t.Fatalf("error = %v", err)
	}
}

func TestDefaultLogoutAndConditionalLogin(t *testing.T) {
	server := NewServer()
	client := NewClient("signed-in")
	if server.HasMethod(protocol.MethodLogin) || server.HasMethod(protocol.MethodList) {
		t.Fatal("optional or reserved method was installed by default")
	}
	if _, err := server.Call(context.Background(), protocol.MethodLogout, ejson.Null(), client); err == nil || err.Error() != protocol.ErrorMethodForbidden {
		t.Fatalf("anonymous logout = %v", err)
	}
	client.SetContext(ejson.Object(ejson.Field{Key: "user", Value: ejson.Object(ejson.Field{Key: "_id", Value: ejson.String("u1")})}))
	client.SetAuthenticated(true)
	result, err := server.Call(context.Background(), protocol.MethodLogout, ejson.Null(), client)
	if value, ok := result.Boolean(); err != nil || !ok || !value || client.Authenticated() || client.UserID() != "" || client.Context().Kind() != ejson.KindNull {
		t.Fatalf("logout = %#v, %v; client=%#v", result, err, client)
	}
	if err := server.SetAuth(func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		return ejson.Null(), nil
	}, func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		return ejson.String("application login"), nil
	}); err != nil {
		t.Fatal(err)
	}
	result, err = server.Call(context.Background(), protocol.MethodLogin, ejson.Null(), client)
	if value, ok := result.Text(); err != nil || !ok || value != "application login" {
		t.Fatalf("conditional login = %#v, %v", result, err)
	}
}

func TestSensitiveMethodRedactsTelemetryIncludingCacheHits(t *testing.T) {
	server := NewServer()
	var events []MethodExecution
	server.OnMethodExecution(func(event MethodExecution) { events = append(events, event) })
	if err := server.AddMethod("secret", func(_ context.Context, _ *Client, _ ejson.Value) (ejson.Value, error) {
		return ejson.String("private result"), nil
	}, MethodOptions{Sensitive: true, Cache: true}); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := server.Call(context.Background(), "secret", ejson.String("private input"), nil); err != nil {
			t.Fatal(err)
		}
	}
	if len(events) != 2 {
		t.Fatalf("timing events = %d", len(events))
	}
	for _, event := range events {
		params, _ := event.Params.Text()
		result, _ := event.Result.Text()
		if params != RedactedMethodTelemetry || result != RedactedMethodTelemetry {
			t.Fatalf("sensitive event = %#v", event)
		}
	}
}

func TestAuthenticationPanicReturnsAnInternalFailure(t *testing.T) {
	server := NewServer()
	if err := server.SetAuth(func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		panic("private authentication detail")
	}, func(context.Context, *Client, ejson.Value) (ejson.Value, error) {
		return ejson.Bool(true), nil
	}); err != nil {
		t.Fatal(err)
	}
	client := NewClient("")
	var public PublicError

	if err := server.Authenticate(context.Background(), client, ejson.Object()); err == nil {
		t.Fatal("authentication panic did not return a failure")
	} else if errors.As(err, &public) {
		t.Fatalf("authentication panic became public: %v", err)
	}
	if client.Authenticated() || client.Context().Kind() != ejson.KindNull {
		t.Fatal("authentication panic retained authority")
	}
}
