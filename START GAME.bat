@echo off
rem Double-click this to play the game with sound.
rem
rem YOU DO NOT NEED THIS TO PLAY. game\index.html now opens straight off the disk:
rem it detects a file:// page and loads js\game.bundle.js, a classic script, instead of
rem the ES modules a browser refuses to fetch from a file path. So double-clicking
rem index.html works, and used to give a permanently blank stage.
rem
rem WHAT A SERVER STILL BUYS YOU, and it is only the audio:
rem   - the music bed. Routing a media element through Web Audio needs a CORS-clean
rem     origin, which the file scheme cannot be, so file:// runs with no music.
rem   - the six recorded sound effects. They are decoded with fetch(), which refuses
rem     the file scheme outright, so file:// falls back to the synthesised palette.
rem The game itself -- every phase, every shape, the art, the cut -- is identical.

title Ice Age Mammoth Runner - local server
echo.
echo   Starting local server...
echo   (game\index.html also works on its own, just without music)
echo.

rem Open in Microsoft Edge specifically, rather than whatever the default browser is.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  echo   Opening Microsoft Edge...
  start "" "%EDGE%" "http://127.0.0.1:8080"
) else (
  echo   Edge not found, using your default browser...
  start "" "http://127.0.0.1:8080"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8080

echo.
echo   Server stopped. Press any key to close.
pause > nul
