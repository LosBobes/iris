#!/bin/sh
# Renders which proxies nginx believes about the client address.
#
# The nginx image runs every executable /docker-entrypoint.d/*.sh before it
# starts nginx; this one writes /etc/nginx/iris-real-ip.conf, which
# frontend/nginx.conf includes in the /api/ location. iris-api takes the
# client address only from the X-Real-IP header nginx sets from $remote_addr
# (sign-in rate limits, audit logs), so whatever nginx trusts here decides
# what that address is.
#
# IRIS_TRUSTED_PROXY: space- or comma-separated addresses/CIDRs of the reverse
# proxies in front of this container. Only a request whose TCP peer is one of
# them has its X-Forwarded-For used (rightmost untrusted entry wins). Unset or
# empty (the default) trusts nobody: $remote_addr is the TCP peer, and a
# client cannot spoof its address with X-Forwarded-For. See
# docs/deployment-hetzner.md and deploy/README.md for the values per deploy.
set -eu

out=/etc/nginx/iris-real-ip.conf
trusted=$(printf '%s' "${IRIS_TRUSTED_PROXY:-}" | tr ',' ' ')

: >"$out"
if [ -z "$(printf '%s' "$trusted" | tr -d ' ')" ]; then
    echo "iris-real-ip: IRIS_TRUSTED_PROXY unset, X-Forwarded-For is not trusted"
    exit 0
fi

for entry in $trusted; do
    case "$entry" in
    *[!0-9A-Fa-f.:/]*)
        echo "iris-real-ip: invalid IRIS_TRUSTED_PROXY entry: $entry" >&2
        exit 1
        ;;
    esac
    printf 'set_real_ip_from %s;\n' "$entry" >>"$out"
done
printf 'real_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n' >>"$out"
echo "iris-real-ip: trusting X-Forwarded-For from: $trusted"
