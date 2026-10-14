@echo off
rem ---------------------------------------------------------------------------
rem Build Windows: controlla i prerequisiti, npm install, poi
rem npm run tauri:build:<lingua> (installer + exe) o tauri:exe:<lingua> (solo exe).
rem Tutto l'output va in build.log nella radice del progetto.
rem Uso: doppio click, oppure da terminale:  scripts\build-windows.cmd [it|en] [exe]
rem   lingua dell'app, predefinita: it;  exe = solo l'eseguibile, senza installer
rem ---------------------------------------------------------------------------
setlocal
set "APP_LANG=%~1"
if "%APP_LANG%"=="" set "APP_LANG=it"
set "TARGET=build"
if /i "%~2"=="exe" set "TARGET=exe"
cd /d "%~dp0.."
set "LOG=%CD%\build.log"
echo [%date% %time%] Avvio build in %CD% > "%LOG%"
echo STATUS=RUNNING >> "%LOG%"
echo Lingua dell'app: %APP_LANG% - tipo: %TARGET% >> "%LOG%"

echo === Prerequisiti === >> "%LOG%"
where node >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ERRORE: Node.js non trovato nel PATH. Installa Node 20+ da https://nodejs.org >> "%LOG%"
  goto fail
)
for /f "delims=" %%v in ('node -v') do echo node %%v >> "%LOG%"
where cargo >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ERRORE: Rust/cargo non trovato nel PATH. Installa rustup da https://rustup.rs e i Visual Studio Build Tools ^(workload "Desktop development with C++"^). >> "%LOG%"
  goto fail
)
for /f "delims=" %%v in ('cargo --version') do echo %%v >> "%LOG%"

echo === npm install === >> "%LOG%"
echo [%time%] npm install... >> "%LOG%"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ERRORE: npm install non riuscito >> "%LOG%"
  goto fail
)

echo === npm run tauri:%TARGET%:%APP_LANG% === >> "%LOG%"
echo [%time%] build... >> "%LOG%"
call npm run tauri:%TARGET%:%APP_LANG% >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ERRORE: build non riuscita >> "%LOG%"
  goto fail
)

echo === Risultato === >> "%LOG%"
if "%TARGET%"=="build" dir /s /b "src-tauri\target\release\bundle\*.msi" "src-tauri\target\release\bundle\*.exe" >> "%LOG%" 2>&1
dir /b "src-tauri\target\release\*.exe" >> "%LOG%" 2>&1
echo STATUS=OK >> "%LOG%"
echo [%date% %time%] Build completata >> "%LOG%"
echo.
echo Build completata. Dettagli in build.log
goto end

:fail
echo STATUS=FAIL >> "%LOG%"
echo [%date% %time%] Build fallita >> "%LOG%"
echo.
echo Build fallita. Vedi build.log

:end
endlocal
timeout /t 20 >nul
