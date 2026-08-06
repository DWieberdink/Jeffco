@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Jeffco Data Tools — migrate Decision Data Export column headers
echo Close Excel and the dashboard if the CSV is open.
echo.

"%~dp0JeffcoDataTools.exe" migrate-decision-headers --dashboard "%~dp0"
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo Migration failed ^(exit %ERR%^).
) else (
  echo Done.
)

pause
endlocal
exit /b %ERR%
