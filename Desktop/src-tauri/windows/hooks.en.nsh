; NSIS installer hooks (English): texts of the local AI option.
!define PGM_AI_CHECKBOX "Also install the free local AI (Ollama + Qwen 3 4B model, about 4 GB to download). You can also do it later from Settings."
!define PGM_AI_PROGRESS "Installing the local AI (Ollama and models): this may take several minutes..."
!define PGM_AI_DONE "Local AI installed."
!define PGM_AI_FAILED_LOG "Local AI not installed: Todo Doto works anyway."
!define PGM_AI_FAILED "The local AI could not be installed (no connection or download failed).$\r$\n$\r$\nTodo Doto is installed and works normally: you can turn on the AI later from Settings › Local AI."
!include "${__FILEDIR__}\local-ai.nsh"
