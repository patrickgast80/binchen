@echo off
rem Watchdog wrapper for the Telegram bridge (BIL-2481).
rem Restarts the bridge on crash; stops looping if config is missing (exit code 2).
rem BIL-2519: every iteration is logged to watchdog.log so a dead watchdog is
rem diagnosable (the pre-2519 loop died silently after a node kill).
:loop
node "%~dp0bridge.mjs" >> "%~dp0bridge.log" 2>&1
set EC=%errorlevel%
echo %date% %time% bridge exited with code %EC% >> "%~dp0watchdog.log"
if "%EC%"=="2" (
  echo %date% %time% exit 2 = unconfigured, watchdog stops. See bridge.log >> "%~dp0watchdog.log"
  exit /b 2
)
timeout /t 5 /nobreak >nul
echo %date% %time% restarting bridge >> "%~dp0watchdog.log"
goto loop
