"""Run browser acceptance tests with a directly owned temporary server (Windows-safe)."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=0, help='0 chooses an available temporary port')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    port = args.port
    if not port:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
    results = root / 'test-results'
    results.mkdir(exist_ok=True)
    with (results / 'server.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, '-X', 'utf8', 'server.py', '--port', str(port)],
                                   cwd=root, stdout=log, stderr=subprocess.STDOUT)
        try:
            url = f'http://127.0.0.1:{port}'
            for _ in range(200):
                if process.poll() is not None:
                    raise RuntimeError('测试服务启动失败，请查看 test-results/server.log')
                try:
                    with urlopen(url + '/api/health', timeout=1) as response:
                        if json.load(response)['ready']:
                            break
                except OSError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError('测试服务启动超时')
            environment = dict(os.environ, GAME_URL=url)
            return subprocess.run(['node', 'tests/browser.cjs'], cwd=root, env=environment).returncode
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    raise SystemExit(main())
