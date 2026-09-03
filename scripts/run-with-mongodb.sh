#!/usr/bin/env bash

set -euo pipefail

readonly MONGODB_IMAGE='mongo:8'
readonly MONGODB_PORT='27017'
readonly MONGODB_READY_ATTEMPTS='120'
readonly MONGODB_READY_INTERVAL_SECONDS='0.25'
readonly MONGODB_CONTAINER_LABEL='typeferry.purpose=release-verification'

if (( $# == 0 )); then
  printf '%s\n' 'error: run-with-mongodb.sh requires a command to execute' >&2
  exit 64
fi

if [[ -n "${TYPEFERRY_MONGODB_TEST_URI:-}" ]]; then
  exec "$@"
fi

mongodb_container_id=''

cleanup() {
  if [[ -n "$mongodb_container_id" ]]; then
    docker stop "$mongodb_container_id" >/dev/null
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

if ! started_container_id=$(docker run \
  --detach \
  --rm \
  --label "$MONGODB_CONTAINER_LABEL" \
  --publish "127.0.0.1::${MONGODB_PORT}" \
  "$MONGODB_IMAGE" \
  --replSet rs0 \
  --bind_ip_all); then
  printf '%s\n' \
    'error: failed to start temporary MongoDB; start Docker or provide TYPEFERRY_MONGODB_TEST_URI' >&2
  exit 1
fi

mongodb_container_id="$started_container_id"

if ! mongodb_mapping=$(docker port \
  "$mongodb_container_id" "${MONGODB_PORT}/tcp"); then
  printf '%s\n' 'error: Docker did not report the temporary MongoDB port' >&2
  exit 1
fi

mongodb_host_port="${mongodb_mapping##*:}"

if [[ ! "$mongodb_host_port" =~ ^[0-9]+$ ]]; then
  printf 'error: invalid temporary MongoDB port mapping: %s\n' \
    "$mongodb_mapping" >&2
  exit 1
fi

mongodb_ready='false'

for (( attempt = 1; attempt <= MONGODB_READY_ATTEMPTS; attempt += 1 )); do
  if docker exec "$mongodb_container_id" mongosh --quiet --eval \
    "try { rs.status().ok } catch { rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]}).ok }" \
    2>/dev/null | grep -q '^1$'; then
    mongodb_ready='true'
    break
  fi

  sleep "$MONGODB_READY_INTERVAL_SECONDS"
done

if [[ "$mongodb_ready" != 'true' ]]; then
  printf '%s\n' 'error: temporary MongoDB replica set did not become ready within 30 seconds' >&2
  exit 1
fi

export TYPEFERRY_MONGODB_TEST_URI="mongodb://127.0.0.1:${mongodb_host_port}/?replicaSet=rs0&directConnection=true"

set +e
"$@"
command_status=$?
set -e

exit "$command_status"
