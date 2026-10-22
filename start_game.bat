@echo off
setlocal
cd /d "%~dp0"
python -X utf8 server.py --open %*
if errorlevel 1 pause
