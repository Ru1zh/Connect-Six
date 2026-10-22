"""Local Connect6 web server. Python 3.10+, standard library only."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'web'
SOURCE = ROOT / 'FinalVersion.cpp'
BINARY = ROOT / 'build' / f'{sys.platform}-{platform.machine().lower() or "unknown"}' / ('connect6-ai.exe' if os.name == 'nt' else 'connect6-ai')
BUILD_LOCK = threading.Lock()
AI_SLOTS = threading.BoundedSemaphore(2)
mimetypes.add_type('text/javascript', '.mjs')


def find_compiler() -> str:
    compiler = os.environ.get('CXX')
    if compiler:
        return compiler
    for name in ('g++', 'clang++', 'c++'):
        compiler = shutil.which(name)
        if compiler:
            return compiler
    if sys.platform == 'win32':
        candidate = Path(r'E:\Program Files\msys64\ucrt64\bin\g++.exe')
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError('未找到 C++ 编译器。macOS 请安装 Xcode Command Line Tools；Linux 请安装 g++ 或 clang++；Windows 请安装 MinGW-w64。也可设置 CXX 为编译器完整路径。')


def build_ai() -> Path:
    """Compile FinalVersion.cpp directly without changing its contents."""
    with BUILD_LOCK:
        source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        signature = BINARY.with_name(BINARY.name + '.source.sha256')
        # A previous adapter binary must not be reused just because it is newer.
        if BINARY.exists() and signature.exists() and signature.read_text(encoding='ascii').strip() == source_hash:
            return BINARY
        compiler = find_compiler()
        BINARY.parent.mkdir(parents=True, exist_ok=True)
        temporary = BINARY.with_name('connect6-ai-building' + BINARY.suffix)
        command = [compiler, '-std=c++17', '-O2', str(SOURCE), '-o', str(temporary)]
        if sys.platform == 'win32':
            # MinGW executable can launch without the compiler's DLL search path.
            command.extend(['-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-static'])
        try:
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8',
                                    errors='replace', timeout=90, cwd=ROOT)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(f'编译 AI 失败：{exc}') from exc
        if result.returncode:
            raise RuntimeError('编译 AI 失败：\n' + result.stderr)
        temporary.replace(BINARY)
        signature.write_text(source_hash + '\n', encoding='ascii')
        return BINARY


def point_valid(point):
    return (isinstance(point, list) and len(point) == 2
            and all(type(n) is int and 0 <= n < 15 for n in point))


def wins(board, x, y):
    color = board[x][y]
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        count = 1
        for sign in (-1, 1):
            a, b = x + dx*sign, y + dy*sign
            while 0 <= a < 15 and 0 <= b < 15 and board[a][b] == color:
                count += 1
                a, b = a + dx*sign, b + dy*sign
        if count >= 6:
            return True
    return False


def apply_turn(board, stones, color, required):
    """Validate a complete turn; allow one stone only when it ends the game."""
    if not isinstance(stones, list) or not 1 <= len(stones) <= required:
        raise ValueError('本回合落子数量不正确。')
    seen = set()
    for point in stones:
        if not point_valid(point):
            raise ValueError('落点必须为棋盘内的整数坐标。')
        x, y = point
        if (x, y) in seen or board[x][y]:
            raise ValueError('落点重复或已有棋子。')
        seen.add((x, y))
    played = []
    terminal = False
    for x, y in stones:
        board[x][y] = color
        played.append([x, y])
        if wins(board, x, y) or all(all(column) for column in board):
            terminal = True
            break
    if len(stones) < required and not terminal:
        raise ValueError('本回合尚未下满棋子。')
    return played, terminal


def validate_history(history, ai_color):
    if type(ai_color) is not int or ai_color not in (1, -1):
        raise ValueError('AI 执子颜色不正确。')
    if not isinstance(history, list) or len(history) > 113:
        raise ValueError('对局历史格式不正确。')
    board = [[0]*15 for _ in range(15)]
    color = 1
    for index, turn in enumerate(history):
        if not isinstance(turn, dict) or type(turn.get('color')) is not int or turn['color'] != color:
            raise ValueError('对局历史的黑白顺序不正确。')
        free = sum(column.count(0) for column in board)
        _, terminal = apply_turn(board, turn.get('stones'), color, min(1 if index == 0 else 2, free))
        if terminal:
            raise ValueError('对局已经结束，不能继续请求 AI。')
        color = -color
    if color != ai_color:
        raise ValueError('当前不是 AI 的回合。')
    return board


def to_protocol(history, ai_color):
    def line(turn):
        points = turn['stones']
        values = points[0] + (points[1] if len(points) == 2 else [-1, -1])
        return ' '.join(map(str, values))
    # Black sees a sentinel opponent move before its first (single-stone) turn.
    rows = ['-1 -1 -1 -1'] if ai_color == 1 else []
    rows.extend(line(turn) for turn in history)
    turns = len(history)//2 + 1
    return str(turns) + '\n' + '\n'.join(rows) + '\n'


def request_ai(history, ai_color):
    board = validate_history(history, ai_color)
    binary = build_ai()
    try:
        result = subprocess.run([str(binary)], input=to_protocol(history, ai_color),
                                capture_output=True, text=True, encoding='utf-8',
                                errors='replace', timeout=30, cwd=ROOT)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('AI 单次计算超时（30 秒），可以重试；累计时钟继续计时。') from exc
    except OSError as exc:
        raise RuntimeError(f'无法启动 AI：{exc}') from exc
    if result.returncode:
        raise RuntimeError(f'AI 程序异常退出（代码 {result.returncode}），请重试。')
    try:
        values = list(map(int, result.stdout.split()))
        if len(values) != 4:
            raise ValueError('坐标数量错误')
        stones = [values[:2]]
        if values[2:] != [-1, -1]:
            stones.append(values[2:])
        free = sum(column.count(0) for column in board)
        played, _ = apply_turn(board, stones, ai_color, min(1 if not history else 2, free))
        return played
    except (TypeError, ValueError) as exc:
        raise RuntimeError('AI 返回了非法落点，请重试。') from exc


class Handler(BaseHTTPRequestHandler):
    server_version = 'Connect6Local/1.0'

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Client reset, undid the move, or ran out of time.

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/api/health':
            self.reply(200, {'ready': BINARY.is_file()})
            return
        target = (WEB / ('index.html' if path == '/' else path.lstrip('/'))).resolve()
        if not target.is_relative_to(WEB) or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', (mimetypes.guess_type(target)[0] or 'application/octet-stream') + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        if self.path != '/api/ai':
            self.reply(404, {'error': '接口不存在。'})
            return
        origin = self.headers.get('Origin')
        if origin:
            parsed = urlsplit(origin)
            if parsed.scheme != 'http' or parsed.netloc != self.headers.get('Host'):
                self.reply(403, {'error': '请从本地游戏网页请求 AI。'})
                return
        if self.headers.get_content_type() != 'application/json':
            self.reply(415, {'error': '请求必须使用 JSON 格式。'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('请求长度不正确。')
            self.connection.settimeout(10)
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(data, dict):
                raise ValueError('请求必须是 JSON 对象。')
            if not AI_SLOTS.acquire(blocking=False):
                self.reply(503, {'error': 'AI 正在处理其他请求，请稍后重试。'})
                return
            try:
                stones = request_ai(data.get('history'), data.get('aiColor'))
            finally:
                AI_SLOTS.release()
            self.reply(200, {'stones': stones})
        except (ValueError, UnicodeError) as exc:
            self.reply(400, {'error': str(exc)})
        except RuntimeError as exc:
            self.reply(502, {'error': str(exc)})
        except (OSError, TimeoutError):
            self.reply(408, {'error': '请求连接超时或中断，请重试。'})


def main():
    parser = argparse.ArgumentParser(description='本地六子棋，每方累计 10 分钟')
    parser.add_argument('--port', type=int, default=8000, help='本地端口，默认 8000')
    parser.add_argument('--open', action='store_true', help='启动后打开浏览器')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('端口必须在 1–65535 之间。')
    try:
        # Bind first so an occupied port is reported before spending time compiling.
        httpd = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as exc:
        print(f'无法启动：端口 {args.port} 可能已被占用。可使用 --port 8001。\n{exc}', file=sys.stderr)
        return 1
    try:
        print('正在检查／编译 C++ AI…', flush=True)
        build_ai()
    except (RuntimeError, OSError) as exc:
        httpd.server_close()
        print(str(exc), file=sys.stderr)
        return 1
    url = f'http://127.0.0.1:{args.port}'
    print(f'游戏已启动：{url}\n按 Ctrl+C 关闭服务。', flush=True)
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n服务已关闭。')
    finally:
        httpd.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
