# Connect Six · Local Game Room

[简体中文](README.md) | **English**

Play Connect Six in your browser against the AI or another player on the same computer. The AI uses the C++ strategy in `FinalVersion.cpp` directly.

## Features

- A 15×15 board with a choice of Black or White in single-player mode.
- Two-player mode with players taking turns on the same computer.
- A 10-minute clock for each side, move confirmation, undo, and restart.
- Move history, recent-move markers, winning-line highlights, and keyboard controls.

## Quick start

Requires **Python 3.10+** and a **C++17** compiler (g++, clang++, or c++) on your `PATH`. No third-party Python packages are needed.

Download or clone the repository, then launch from its root directory:

### Windows

Double-click `start_game.bat`, or run it in PowerShell:

```powershell
.\start_game.bat
```

### macOS

```sh
sh ./start_game.sh
```

If the C++ command-line tools are missing, run `xcode-select --install`. To launch by double-clicking in Finder, run `chmod +x start_game.command` once, then double-click `start_game.command`.

### Linux

```sh
sh ./start_game.sh
```

On Ubuntu / Debian, install the dependencies with:

```sh
sudo apt update
sudo apt install python3 g++
```

The first launch compiles the AI and opens [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the server window open; press `Ctrl+C` to stop it. If the browser does not open automatically, visit the address manually.

If the port is occupied, specify another one:

```powershell
# Windows
.\start_game.bat --port 8001
```

```sh
# macOS / Linux
sh ./start_game.sh --port 8001
```

You can also set the `CXX` environment variable to a compiler executable.

## How to play

1. Choose a mode and color, then click “开始对局” (Start game). Black places one stone on the opening turn; every subsequent turn consists of two stones.
2. Click an intersection to select a position, and click it again to deselect it. Click “确认落子” (Confirm move) when ready. Your clock keeps running while you select positions.
3. Six or more consecutive stones horizontally, vertically, or diagonally wins. There are no forbidden moves. If the first stone completes a winning line, you can confirm immediately. A full board with no winner is a draw.
4. Each side has 10 minutes for the entire game, with no increment or pause. Running out of time loses the game. AI calculation, switching tabs, and opening confirmation dialogs all count toward the active side's time.

Undo first clears unconfirmed selections. In two-player mode, it removes the most recent complete turn. In single-player mode, it removes the player's most recent turn and any following AI turn, keeping the AI's opening move when it plays Black. **Undo does not refund time already spent.**

Use the arrow keys to move focus, `Enter` / Space to select or deselect, and `Esc` to clear selections. Refreshing the page clears the game; restarting or changing the mode or color resets the board and clocks.

## Project structure

| File | Purpose |
| --- | --- |
| `FinalVersion.cpp` | C++ AI strategy, compiled directly at startup |
| `server.py` | Local web server and AI execution |
| `web/` | Board interface, game rules, and clock logic |
| `start_game.*` | Platform-specific launch scripts |
| `tests/` | Game-rule, clock, and AI interface tests |

The interface is in Simplified Chinese. The server listens only on `127.0.0.1`; two-player mode does not support remote play. If the AI times out or returns an invalid move, the page reports the error and lets you retry, undo, or restart.
