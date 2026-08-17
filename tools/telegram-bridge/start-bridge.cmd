@echo off
rem Watchdog wrapper for the Telegram bridge (BIL-2481).
rem Restarts the bridge on crash; stops looping if config is missing (exit code 2).
:loop
node "%~dp0bridge.mjs" >> "%~dp0bridge.log" 2>&1
if %errorlevel%==2 (
  echo Bridge unconfigured (exit 2) - not restarting. See %~dp0bridge.log
  exit /b 2
)
timeout /t 5 /nobreak >nul
goto loop
