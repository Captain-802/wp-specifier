@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Windpost Select - update database from Excel
echo ============================================================
echo.
echo Source workbook: windpost-database.xlsx
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found on this PC.
  echo Install Node.js from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

echo [1/3] Reading the workbook and rebuilding the data files...
call node tools\build-database.js
if errorlevel 1 (
  echo.
  echo Update stopped. The workbook has a problem ^(see the list above^).
  echo Nothing was changed. Fix the Excel file and run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] Running the self-check tests...
rem Every suite in tests\ - the regenerated section data feeds all of them.
for %%t in ("tests\*.js") do (
  call node "%%~t" >nul 2>nul
  if errorlevel 1 (
    echo       FAILED: %%~nxt
    goto testfail
  )
)
echo       All tests passed.

echo.
echo [3/3] Rebuilding the standalone calculator...
call node build-standalone.js
if errorlevel 1 (
  echo ERROR: could not rebuild the standalone HTML file.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   Done. The calculator now reflects the Excel workbook.
echo   Open it with OPEN-WINDPOST-SELECTOR.cmd
echo ============================================================
echo.
pause
exit /b 0

:testfail
echo.
echo ERROR: the self-check tests did not pass after the update.
echo The data files were rebuilt but may be inconsistent.
echo Please review the workbook changes ^(or restore the previous
echo windpost-database.xlsx^) and run this again.
echo.
pause
exit /b 1
