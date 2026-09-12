# frozen_string_literal: true

module TypeFerry
  module Protocol
    HTTP_PATH = "/__h"
    WEBSOCKET_PATH = "/typeferry-ws"
    NO_CHANNEL = "NO_CHANNEL"
    AUTH_TIMEOUT_MS = 5_000
    PING_INTERVAL_MS = 25_000
    DEFAULT_CACHE_MAX_AGE_MS = 60_000
    REDIS_EVENTS_CHANNEL = "events"

    module MessageType
      RPC = "rpc"
      RPC_VOID = "rpc:void"
      RPC_RESPONSE = "rpc:res"
      EVENT = "event"
      AUTH = "auth"
      PING = "ping"
      PONG = "pong"
    end

    module Methods
      RPC_ON = "rpc:on"
      RPC_OFF = "rpc:off"
      RPC_LOGIN = "rpc:login"
      RPC_LOGOUT = "rpc:logout"
      LIST_METHODS = "list:methods"
    end

    module Errors
      AUTHENTICATION_FAILED = "Authentication Failed"
      EVENT_FORBIDDEN = "Event Forbidden"
      EVENT_NOT_FOUND = "Event Not Found"
      EVENT_NOT_PROVIDED = "Event Not Provided"
      EVENT_NOT_SUBSCRIBED = "Event Not Subscribed"
      INTERNAL_ERROR = "Internal Error"
      INVALID_METHOD_NAME = "Invalid Method Name"
      INVALID_PARAMS = "Invalid Params"
      INVALID_REQUEST = "Invalid Request"
      INVALID_TOKEN = "Invalid Token"
      METHOD_FORBIDDEN = "Method Forbidden"
      METHOD_NOT_FOUND = "Method Not Found"
      METHOD_NOT_SPECIFIED = "Method Not Specified"
      PARAMS_NOT_FOUND = "Params Not Found"
      PARSE_ERROR = "Parse Error"
      SUBSCRIPTION_ERROR = "Subscription Error"
      RATE_LIMIT_EXCEEDED = "Rate Limit Exceeded"
    end
  end
end
