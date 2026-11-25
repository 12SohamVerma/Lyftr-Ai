#!/bin/sh
# Make sure the SQLite volume is writable by the unprivileged `app` user, then run
# the server as that user. Hosting platforms (Render disks, Railway volumes) often
# mount a fresh, root-owned directory at /data; a Docker named volume already
# inherits the image's ownership, in which case nothing needs to change.
set -e

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    if [ "$(stat -c %U "$DATA_DIR")" != "app" ]; then
        chown -R app:app "$DATA_DIR"
    fi
    exec setpriv --reuid=app --regid=app --init-groups -- "$@"
fi

exec "$@"
