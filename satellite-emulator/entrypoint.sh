#!/bin/sh
set -eu

if [ "${DEFAULT_ROUTE:-}" ]; then
    ip route del default 2> /dev/null || true
    ip route add default via "$DEFAULT_ROUTE" dev eth0
fi

exec nginx -g 'daemon off;'
