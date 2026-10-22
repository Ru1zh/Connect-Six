#!/bin/sh
# macOS double-click entry. The shared script need not have executable permission.
set -eu
SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
exec /bin/sh "$SCRIPT_DIR/start_game.sh" "$@"
