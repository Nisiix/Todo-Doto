; Opzione facoltativa dell'installer: "Installa anche l'IA locale".
;
; - Casella sulla pagina di benvenuto, NON spuntata di default.
; - Nelle installazioni silenziose, passive e negli aggiornamenti la pagina non
;   compare: l'IA non si installa mai da sola.
; - Se spuntata, a fine installazione si esegue install-local-ai.ps1 (installato
;   con l'app): scarica Ollama (firmato) e i modelli. Se fallisce (es. niente
;   connessione) si avvisa e basta: l'installazione dell'app resta valida.
; - L'app, al primo avvio, trova Ollama con il modello e attiva l'IA locale.
;
; I testi (PGM_AI_*) li definisce hooks.<lingua>.nsh prima di includere questo file.

!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

Var PgmAiCheckbox
Var PgmAiText
Var PgmInstallAi

; Variabili della pagina di benvenuto di MUI2, dichiarate qui (come fa MUI2) per
; poterle usare nella funzione qui sotto, compilata prima della pagina.
!ifndef MUI_WELCOMEPAGE_INTERFACE
  !define MUI_WELCOMEPAGE_INTERFACE
  Var mui.WelcomePage
  Var mui.WelcomePage.Image
  Var mui.WelcomePage.Image.Bitmap
  Var mui.WelcomePage.Title
  Var mui.WelcomePage.Title.Font
  Var mui.WelcomePage.Text
!endif

; Valgono per la pagina successiva, che nel modello di Tauri è quella di benvenuto
!define MUI_PAGE_CUSTOMFUNCTION_SHOW PgmWelcomeShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE PgmWelcomeLeave

Function PgmWelcomeShow
  ; Il testo di benvenuto occupa fino in fondo alla pagina: lo si ricrea più
  ; basso di altezza per fare posto alla casella (altrimenti la coprirebbe).
  ${NSD_GetText} $mui.WelcomePage.Text $0
  ShowWindow $mui.WelcomePage.Text ${SW_HIDE}
  ${NSD_CreateLabel} 120u 45u 195u 102u $0
  Pop $PgmAiText
  SetCtlColors $PgmAiText "000000" "FFFFFF"
  ${NSD_CreateCheckbox} 120u 150u 195u 36u "${PGM_AI_CHECKBOX}"
  Pop $PgmAiCheckbox
  ${NSD_AddStyle} $PgmAiCheckbox ${BS_MULTILINE}|${BS_TOP}
  SetCtlColors $PgmAiCheckbox "" "FFFFFF"
  ${If} $PgmInstallAi == ${BST_CHECKED}
    ${NSD_Check} $PgmAiCheckbox
  ${EndIf}
FunctionEnd

Function PgmWelcomeLeave
  ${NSD_GetState} $PgmAiCheckbox $PgmInstallAi
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $PgmInstallAi == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$INSTDIR\install-local-ai.ps1"
    DetailPrint "${PGM_AI_PROGRESS}"
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\install-local-ai.ps1"'
    Pop $0
    ${If} $0 == 0
      DetailPrint "${PGM_AI_DONE}"
    ${Else}
      DetailPrint "${PGM_AI_FAILED_LOG}"
      MessageBox MB_OK|MB_ICONINFORMATION "${PGM_AI_FAILED}" /SD IDOK
    ${EndIf}
  ${EndIf}
!macroend
