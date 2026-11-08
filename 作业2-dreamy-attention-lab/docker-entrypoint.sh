#!/bin/sh
set -e

# Railway mounts the persistent volume as root, which shadows the /data
# directory created during the image build. Fix ownership at startup, then
# drop privileges so the Node process never runs as root.
if [ "$(id -u)" = "0" ]; then
  DATA_DIR="${DATA_DIR:-/data}"
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec gosu node "$@"
fi

exec "$@"
