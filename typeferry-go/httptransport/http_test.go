package httptransport

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/leonardoventurini/typeferry/typeferry-go/ejson"
	"github.com/leonardoventurini/typeferry/typeferry-go/protocol"
	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

type fixture struct {
	Setup struct {
		Methods []struct {
			Name      string `json:"name"`
			Handler   string `json:"handler"`
			Protected bool   `json:"protected"`
			Schema    *struct {
				Issues []struct {
					Path    []string `json:"path"`
					Message string   `json:"message"`
				} `json:"issues"`
			} `json:"schema"`
		} `json:"methods"`
		Auth *struct {
			AcceptToken string `json:"accept_token"`
			User        struct {
				ID string `json:"_id"`
			} `json:"user"`
		} `json:"auth"`
	} `json:"setup"`
	Request struct {
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body"`
	} `json:"request"`
	Response struct {
		Status  int     `json:"status"`
		Body    *string `json:"body"`
		Decoded any     `json:"decoded"`
	} `json:"response"`
}

func TestSharedHTTPFixtures(t *testing.T) {
	paths, err := filepath.Glob("../../docs/conformance/fixtures/http/*.case.json")
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) == 0 {
		t.Fatal("no HTTP fixtures")
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var example fixture
		if err := json.Unmarshal(data, &example); err != nil {
			t.Fatal(err)
		}
		t.Run(filepath.Base(path), func(t *testing.T) {
			server := runtime.NewServer()
			for _, definition := range example.Setup.Methods {
				handlerName := definition.Handler
				options := runtime.MethodOptions{Protected: definition.Protected}
				if definition.Schema != nil {
					issues := make([]runtime.ValidationIssue, 0, len(definition.Schema.Issues))
					for _, issue := range definition.Schema.Issues {
						issues = append(issues, runtime.ValidationIssue{Path: issue.Path, Message: issue.Message})
					}
					options.Validate = func(value ejson.Value) (ejson.Value, []runtime.ValidationIssue) { return value, issues }
				}
				if err := server.AddMethod(definition.Name, fixtureHandler(handlerName), options); err != nil {
					t.Fatal(err)
				}
			}
			if example.Setup.Auth != nil {
				accept := example.Setup.Auth.AcceptToken
				userID := example.Setup.Auth.User.ID
				server.SetAuth(func(_ context.Context, _ *runtime.Client, value ejson.Value) (ejson.Value, error) {
					token, ok := value.Lookup("token")
					if !ok {
						return ejson.Null(), nil
					}
					text, _ := token.Text()
					if text != accept {
						return ejson.Null(), nil
					}
					return ejson.Object(ejson.Field{Key: "user", Value: ejson.Object(ejson.Field{Key: "_id", Value: ejson.String(userID)})}), nil
				}, fixtureHandler("return_const:true"))
			}

			app := New(server, Options{DisableRateLimit: true})
			request := httptest.NewRequest(http.MethodPost, protocol.HTTPPath, strings.NewReader(example.Request.Body))
			for key, value := range example.Request.Headers {
				request.Header.Set(key, value)
			}
			response := httptest.NewRecorder()
			app.ServeHTTP(response, request)
			if response.Code != example.Response.Status {
				t.Fatalf("status = %d, want %d", response.Code, example.Response.Status)
			}
			if example.Response.Body != nil {
				if response.Body.String() != *example.Response.Body {
					t.Fatalf("body = %q, want %q", response.Body.String(), *example.Response.Body)
				}
				return
			}
			var actual any
			if err := json.Unmarshal(response.Body.Bytes(), &actual); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, example.Response.Decoded) {
				t.Fatalf("response = %#v, want %#v", actual, example.Response.Decoded)
			}
		})
	}
}

func fixtureHandler(name string) runtime.Handler {
	return func(_ context.Context, client *runtime.Client, params ejson.Value) (ejson.Value, error) {
		switch {
		case name == "add_two_integers":
			a, _ := params.Lookup("a")
			b, _ := params.Lookup("b")
			left, _ := a.Integer()
			right, _ := b.Integer()
			return ejson.Int(left + right), nil
		case name == "return_user_id":
			return ejson.String(client.UserID()), nil
		case strings.HasPrefix(name, "return_const:"):
			return ejson.String(strings.TrimPrefix(name, "return_const:")), nil
		case strings.HasPrefix(name, "raise_public:"):
			return ejson.Null(), runtime.PublicError(strings.TrimPrefix(name, "raise_public:"))
		default:
			return ejson.Null(), fmt.Errorf("unknown fixture handler %s", name)
		}
	}
}

func TestOriginAndBodyLimits(t *testing.T) {
	server := runtime.NewServer()
	app := New(server, Options{Origins: []string{"https://example.test"}, MaxBodyBytes: 8, DisableRateLimit: true})
	for _, example := range []struct {
		origin, body string
		status       int
	}{
		{"", "{}", http.StatusForbidden},
		{"https://other.test", "{}", http.StatusForbidden},
		{"https://example.test", strings.Repeat("x", 9), http.StatusRequestEntityTooLarge},
	} {
		request := httptest.NewRequest(http.MethodPost, protocol.HTTPPath, strings.NewReader(example.body))
		if example.origin != "" {
			request.Header.Set("Origin", example.origin)
		}
		response := httptest.NewRecorder()
		app.ServeHTTP(response, request)
		if response.Code != example.status {
			t.Fatalf("origin %q, body size %d: status %d", example.origin, len(example.body), response.Code)
		}
	}
}

func TestRateLimitAndResponseHeaders(t *testing.T) {
	server := runtime.NewServer()
	if err := server.AddMethod("hello", func(_ context.Context, client *runtime.Client, _ ejson.Value) (ejson.Value, error) {
		client.AddResponseHeader("Set-Cookie", "session=one")
		client.AddResponseHeader("Set-Cookie", "other=two")
		return ejson.String("world"), nil
	}, runtime.MethodOptions{}); err != nil {
		t.Fatal(err)
	}
	app := New(server, Options{RateLimitMax: 1})
	requestBody := `{"context":{},"payload":{"method":"hello"}}`
	first := httptest.NewRecorder()
	app.ServeHTTP(first, httptest.NewRequest(http.MethodPost, protocol.HTTPPath, strings.NewReader(requestBody)))
	if first.Code != http.StatusOK || len(first.Header().Values("Set-Cookie")) != 2 {
		t.Fatalf("first response = %d, headers %v", first.Code, first.Header())
	}
	second := httptest.NewRecorder()
	app.ServeHTTP(second, httptest.NewRequest(http.MethodPost, protocol.HTTPPath, strings.NewReader(requestBody)))
	if second.Code != http.StatusTooManyRequests || second.Header().Get("RateLimit-Limit") != "1" {
		t.Fatalf("second response = %d, headers %v", second.Code, second.Header())
	}
}
