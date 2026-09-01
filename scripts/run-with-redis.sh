#!/usr/bin/env bash

set -euo pipefail

readonly REDIS_IMAGE='redis:7-alpine'
readonly REDIS_CONTAINER_PORT='6379'
readonly REDIS_READY_ATTEMPTS='100'
readonly REDIS_READY_INTERVAL_SECONDS='0.1'
readonly REDIS_CONTAINER_LABEL='typeferry.purpose=release-verification'

if (( $# == 0 )); then
  printf '%s\n' 'error: run-with-redis.sh requires a command to execute' >&2
  exit 64
fi

if [[ -n "${REDIS_URL:-}" ]]; then
  exec "$@"
fi

redis_container_id=''

cleanup() {
  if [[ -n "$redis_container_id" ]]; then
    docker stop "$redis_container_id" >/dev/null
  fi
}

handle_signal() {
  local signal_status="$1"

  exit "$signal_status"
}

trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

if ! redis_container_id=$(docker run \
  --detach \
  --rm \
  --label "$REDIS_CONTAINER_LABEL" \
  --publish "127.0.0.1::${REDIS_CONTAINER_PORT}" \
  "$REDIS_IMAGE"); then
  printf '%s\n' \
    'error: failed to start temporary Redis; start Docker or provide REDIS_URL' >&2
  exit 1
fi

if ! redis_mapping=$(docker port \
  "$redis_container_id" "${REDIS_CONTAINER_PORT}/tcp"); then
  printf '%s\n' 'error: Docker did not report the temporary Redis port' >&2
  exit 1
fi

redis_host_port="${redis_mapping##*:}"

if [[ ! "$redis_host_port" =~ ^[0-9]+$ ]]; then
  printf 'error: invalid temporary Redis port mapping: %s\n' \
    "$redis_mapping" >&2
  exit 1
fi

redis_ready='false'

for (( attempt = 1; attempt <= REDIS_READY_ATTEMPTS; attempt += 1 )); do
  if [[ "$(docker exec "$redis_container_id" redis-cli ping 2>/dev/null || true)" == 'PONG' ]]; then
    redis_ready='true'
    break
  fi

  sleep "$REDIS_READY_INTERVAL_SECONDS"
done

if [[ "$redis_ready" != 'true' ]]; then
  printf '%s\n' 'error: temporary Redis did not become ready within 10 seconds' >&2
  exit 1
fi

export REDIS_URL="redis://127.0.0.1:${redis_host_port}"

set +e
"$@"
command_status=$?
set -e

exit "$command_status"
