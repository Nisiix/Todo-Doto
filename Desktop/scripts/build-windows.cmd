@echo off
rem ---------------------------------------------------------------------------
rem Build dell'eseguibile Windows: controlla i prerequisiti, npm install,
rem npm run tauri build. Tutto l'output va in build.log nella radice del progetto.
rem Uso: doppio click, oppure da terminale:  scripts\build-windows.cmd
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."
set "LOG=%CD%\build.log"
echo [%date% %time%] Avvio build in %CD% > "%LOG%"
echo STATUS=RUNNING >> "%LOG%"

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

echo === npm run tauri build === >> "%LOG%"
rem Chiave dell'updater (generata con: npx tauri signer generate -w %USERPROFILE%\.tauri\project-goal-manager.key).
rem Senza chiave la build fallisce perche' tauri.conf.json chiede gli artefatti dell'updater.
if exist "%USERPROFILE%\.tauri\project-goal-manager.key" (
  set "TAURI_SIGNING_PRIVATE_KEY=%USERPROFILE%\.tauri\project-goal-manager.key"
  set "TAURI_SIGNING_PRIVATE_KEY_PASSWORD="
  echo chiave updater: %USERPROFILE%\.tauri\project-goal-manager.key >> "%LOG%"
) else (
  echo ERRORE: chiave updater non trovata in %USERPROFILE%\.tauri\project-goal-manager.key >> "%LOG%"
  goto fail
)
echo [%time%] build... >> "%LOG%"
call npm run tauri build >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ERRORE: build non riuscita >> "%LOG%"
  goto fail
)

echo === Risultato === >> "%LOG%"
dir /s /b "src-tauri\target\release\bundle\*.msi" "src-tauri\target\release\bundle\*.exe" >> "%LOG%" 2>&1
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
