; Hook dell'installer NSIS (italiano): testi dell'opzione IA locale.
!define PGM_AI_CHECKBOX "Installa anche l'IA locale gratuita (Ollama + modello Qwen 3 4B, circa 4 GB da scaricare). Puoi farlo anche dopo, dalle Impostazioni."
!define PGM_AI_PROGRESS "Installazione dell'IA locale (Ollama e modelli): può richiedere diversi minuti..."
!define PGM_AI_DONE "IA locale installata."
!define PGM_AI_FAILED_LOG "IA locale non installata: Todo Doto funziona comunque."
!define PGM_AI_FAILED "Non è stato possibile installare l'IA locale (connessione assente o download non riuscito).$\r$\n$\r$\nTodo Doto è installato e funziona normalmente: potrai attivare l'IA più tardi da Impostazioni › IA locale."
!include "${__FILEDIR__}\local-ai.nsh"
