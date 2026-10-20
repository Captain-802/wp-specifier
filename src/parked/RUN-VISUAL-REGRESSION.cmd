@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\run-visual-regression.ps1"
if errorlevel 1 (
  echo.
  echo VISUAL REGRESSION FAILED
  pause
  exit /b 1
)
echo.
echo VISUAL REGRESSION PASSED
pause
