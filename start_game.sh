#!/bin/sh
# macOS / Linux: sh ./start_game.sh [--port 8001]
set -eu

SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    printf '%s\n' '未找到 Python。请先安装 Python 3.10 或以上版本。' >&2
    exit 1
fi

if ! "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    printf '%s\n' '需要 Python 3.10 或以上版本，请更新 python3 后重试。' >&2
    exit 1
fi

exec "$PYTHON" -X utf8 "$SCRIPT_DIR/server.py" --open "$@"
