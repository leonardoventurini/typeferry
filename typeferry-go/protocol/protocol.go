// Package protocol names TypeFerry's stable wire paths, messages, and errors.
// Their values follow the shared PROTOCOL.md contract.
package protocol

const (
	HTTPPath           = "/__h"
	WebSocketPath      = "/typeferry-ws"
	NoChannel          = "NO_CHANNEL"
	RedisEventsChannel = "events"
)

const (
	MessageRPC         = "rpc"
	MessageRPCVoid     = "rpc:void"
	MessageRPCResponse = "rpc:res"
	MessageEvent       = "event"
	MessageAuth        = "auth"
	MessagePing        = "ping"
	MessagePong        = "pong"
)

const (
	MethodOn     = "rpc:on"
	MethodOff    = "rpc:off"
	MethodLogin  = "rpc:login"
	MethodLogout = "rpc:logout"
	MethodList   = "list:methods"
)

const (
	ErrorAuthenticationFailed = "Authentication Failed"
	ErrorEventForbidden       = "Event Forbidden"
	ErrorEventNotFound        = "Event Not Found"
	ErrorEventNotProvided     = "Event Not Provided"
	ErrorEventNotSubscribed   = "Event Not Subscribed"
	ErrorInternal             = "Internal Error"
	ErrorInvalidMethodName    = "Invalid Method Name"
	ErrorInvalidParams        = "Invalid Params"
	ErrorInvalidRequest       = "Invalid Request"
	ErrorInvalidToken         = "Invalid Token"
	ErrorMethodForbidden      = "Method Forbidden"
	ErrorMethodNotFound       = "Method Not Found"
	ErrorMethodNotSpecified   = "Method Not Specified"
	ErrorParamsNotFound       = "Params Not Found"
	ErrorParse                = "Parse Error"
	ErrorSubscription         = "Subscription Error"
	ErrorRateLimit            = "Rate Limit Exceeded"
)
