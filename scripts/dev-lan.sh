#!/bin/sh
# Runs the API or the Expo dev server so that a phone on the same Wi-Fi can use them
# (Expo Go on a real device). Usage: sh scripts/dev-lan.sh api|mobile
#
# The API listens on this Mac's Wi-Fi address only (not 0.0.0.0), and only while the
# command runs; `pnpm dev:api` stays on 127.0.0.1. Use it on a trusted home network: any device
# on the network can then create accounts and spend your TMDB quota through the API.
# PostgreSQL is not affected: it stays bound to 127.0.0.1.
set -eu

API_PORT=3000

ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$ip" ]; then
  echo "No Wi-Fi address found (en0/en1). Connect this Mac to Wi-Fi first." >&2
  exit 1
fi

case "${1:-}" in
  api)
    echo "API for devices on this network: http://$ip:$API_PORT (Ctrl+C to stop)"
    HOST="$ip" PORT="$API_PORT" exec pnpm dev:api
    ;;
  mobile)
    echo "The app will call the API at http://$ip:$API_PORT"
    pnpm --filter @reelmark/shared build
    # --clear: EXPO_PUBLIC_* values are inlined into the bundle, so drop bundles built
    # with another API address.
    EXPO_PUBLIC_API_URL="http://$ip:$API_PORT" exec pnpm --filter @reelmark/mobile exec expo start --clear
    ;;
  *)
    echo "Usage: sh scripts/dev-lan.sh api|mobile" >&2
    exit 2
    ;;
esac
