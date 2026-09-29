// Package authoring groups typed method declarations without reflection.
package authoring

import (
	"errors"
	"strings"
	"time"

	"github.com/leonardoventurini/typeferry/typeferry-go/runtime"
)

type Options struct {
	WireName   string
	Public     bool
	Protected  bool
	Cached     bool
	NoCache    bool
	MaxAge     time.Duration
	Validate   runtime.Validator
	Middleware []runtime.Middleware
}

type declaration struct {
	name    string
	handler runtime.Handler
	options runtime.MethodOptions
}

type Group struct {
	namespace    string
	protected    bool
	cache        bool
	maxAge       time.Duration
	declarations []declaration
}

func NewGroup(namespace string) *Group { return &Group{namespace: namespace} }

func (group *Group) ProtectedByDefault() *Group {
	group.protected = true
	return group
}

func (group *Group) CacheByDefault(maxAge time.Duration) *Group {
	group.cache = true
	group.maxAge = maxAge
	return group
}

func (group *Group) Method(name string, handler runtime.Handler, options Options) (string, error) {
	if name == "" || handler == nil {
		return "", errors.New("method requires a name and handler")
	}
	if options.Public && options.Protected {
		return "", errors.New("method cannot be public and protected")
	}
	if options.Cached && options.NoCache {
		return "", errors.New("method cannot enable and disable cache")
	}
	wireName := options.WireName
	if wireName == "" {
		wireName = strings.Trim(strings.Join([]string{group.namespace, name}, "."), ".")
	}
	protected := group.protected || options.Protected
	if options.Public {
		protected = false
	}
	cache := group.cache || options.Cached
	if options.NoCache {
		cache = false
	}
	maxAge := group.maxAge
	if options.MaxAge > 0 {
		maxAge = options.MaxAge
	}
	methodOptions := runtime.MethodOptions{Protected: protected, Cache: cache, MaxAge: maxAge,
		Validate: options.Validate, Middleware: append([]runtime.Middleware(nil), options.Middleware...)}
	group.declarations = append(group.declarations, declaration{name: wireName, handler: handler, options: methodOptions})
	return wireName, nil
}

func (group *Group) Register(server *runtime.Server) error {
	for _, method := range group.declarations {
		if err := server.AddMethod(method.name, method.handler, method.options); err != nil {
			return err
		}
	}
	return nil
}
