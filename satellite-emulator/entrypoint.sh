#!/bin/sh
set -eu

if [ "${DEFAULT_ROUTE:-}" ]; then
    ip route del default 2> /dev/null || true
    ip route add default via "$DEFAULT_ROUTE" dev eth0
fi

node /usr/src/app/backend/bin/main.js &
backend_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

trap 'kill "$backend_pid" "$nginx_pid" 2> /dev/null || true' INT TERM

while true; do
    if ! kill -0 "$backend_pid" 2> /dev/null; then
        wait "$backend_pid"
        exit $?
    fi

    if ! kill -0 "$nginx_pid" 2> /dev/null; then
        wait "$nginx_pid"
        exit $?
    fi

    sleep 2
done
