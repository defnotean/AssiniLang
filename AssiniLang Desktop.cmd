@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo AssiniLang Desktop needs Node.js and npm before it can start.
  echo Install Node.js, then run npm.cmd install in this folder once.
  pause
  exit /b 1
)

npm.cmd run desktop
set "ASSINI_EXIT_CODE=%ERRORLEVEL%"
if not "%ASSINI_EXIT_CODE%"=="0" (
  echo.
  echo AssiniLang Desktop failed to start. Check the messages above.
  pause
)

exit /b %ASSINI_EXIT_CODE%
