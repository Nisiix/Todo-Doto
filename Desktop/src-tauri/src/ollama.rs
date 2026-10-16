//! Ollama su questo PC: si trova, si avvia e, se manca, si installa con lo
//! stesso script dell'opzione dell'installer (`windows/install-local-ai.ps1`,
//! incluso nell'eseguibile, così funziona anche nella versione portable).
//! Lo script scarica solo l'installer ufficiale da ollama.com e lo esegue solo
//! se è firmato da Ollama; i modelli poi li scarica Ollama stesso (vedi ai.rs,
//! `/api/pull` su 127.0.0.1). Nessun parametro arriva dal frontend.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;

#[cfg(windows)]
const SCRIPT: &str = include_str!("../windows/install-local-ai.ps1");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaInfo {
    /// Ollama è installato su questo PC.
    pub installed: bool,
    /// Si può installare da qui (solo Windows).
    pub can_install: bool,
    pub path: Option<String>,
}

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    }
}

/// Percorso di ollama: cartelle d'installazione note, poi il PATH.
fn find_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(d) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(d).join(r"Programs\Ollama\ollama.exe"));
        }
        if let Ok(d) = std::env::var("ProgramFiles") {
            candidates.push(PathBuf::from(d).join(r"Ollama\ollama.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    candidates.push(PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"));
    #[cfg(not(windows))]
    candidates.push(PathBuf::from("/usr/local/bin/ollama"));

    #[cfg(windows)]
    let path = crate::fresh_path();
    #[cfg(not(windows))]
    let path = std::env::var("PATH").ok();
    let sep = if cfg!(windows) { ';' } else { ':' };
    if let Some(p) = path {
        candidates.extend(p.split(sep).map(str::trim).filter(|d| !d.is_empty()).map(|d| PathBuf::from(d).join(exe_name())));
    }
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
pub fn ollama_info() -> OllamaInfo {
    let exe = find_exe();
    OllamaInfo {
        installed: exe.is_some(),
        can_install: cfg!(windows),
        path: exe.map(|p| p.to_string_lossy().into_owned()),
    }
}

/// Avvia il server di Ollama (`ollama serve`) senza finestra. Resta acceso anche
/// dopo la chiusura dell'app; se era già avviato il nuovo processo esce da solo.
#[tauri::command]
pub fn ollama_start() -> Result<(), String> {
    let exe = find_exe().ok_or_else(|| "not-installed".to_string())?;
    let mut c = Command::new(exe);
    c.arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .current_dir(std::env::temp_dir());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
        c.creation_flags(0x0800_0000 | 0x0000_0200);
    }
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

static INSTALL_PID: Mutex<Option<u32>> = Mutex::new(None);
static INSTALL_CANCELLED: AtomicBool = AtomicBool::new(false);

/// Installa Ollama ed avvia il server. Ogni riga dello script va a `on_line`
/// (`##step …`, `##progress fatti totale`, `##ready`, `##error …`). Restituisce
/// il codice d'uscita dello script (0 = pronto), "cancelled" se interrotto.
#[tauri::command]
pub async fn ollama_install(on_line: tauri::ipc::Channel<String>) -> Result<i32, String> {
    #[cfg(not(windows))]
    {
        let _ = on_line;
        return Err("unsupported".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || {
            install_blocking(|line| {
                let _ = on_line.send(line);
            })
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

#[cfg(windows)]
fn install_blocking(on_line: impl Fn(String)) -> Result<i32, String> {
    use std::os::windows::process::CommandExt;

    if INSTALL_PID.lock().map(|g| g.is_some()).unwrap_or(false) {
        return Err("busy".into());
    }
    INSTALL_CANCELLED.store(false, Ordering::SeqCst);
    let script = std::env::temp_dir().join(format!("todo-doto-ollama-{}.ps1", std::process::id()));
    std::fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
    let powershell = std::env::var("SystemRoot")
        .map(|r| PathBuf::from(r).join(r"System32\WindowsPowerShell\v1.0\powershell.exe"))
        .unwrap_or_else(|_| PathBuf::from("powershell.exe"));
    let mut c = Command::new(powershell);
    c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .arg("-ForApp")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .current_dir(std::env::temp_dir())
        .creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = match c.spawn() {
        Ok(ch) => ch,
        Err(e) => {
            let _ = std::fs::remove_file(&script);
            return Err(e.to_string());
        }
    };
    if let Ok(mut g) = INSTALL_PID.lock() {
        *g = Some(child.id());
    }
    if let Some(out) = child.stdout.take() {
        for chunk in BufReader::new(out).split(b'\n') {
            let Ok(bytes) = chunk else { break };
            let line = String::from_utf8_lossy(&bytes).trim().to_string();
            if !line.is_empty() {
                on_line(line);
            }
        }
    }
    let status = child.wait();
    if let Ok(mut g) = INSTALL_PID.lock() {
        *g = None;
    }
    let _ = std::fs::remove_file(&script);
    if INSTALL_CANCELLED.swap(false, Ordering::SeqCst) {
        return Err("cancelled".into());
    }
    status.map(|s| s.code().unwrap_or(1)).map_err(|e| e.to_string())
}

/// Interrompe l'installazione in corso (script e programmi che ha avviato).
#[tauri::command]
pub fn ollama_install_cancel() {
    let pid = INSTALL_PID.lock().ok().and_then(|g| *g);
    if let Some(pid) = pid {
        INSTALL_CANCELLED.store(true, Ordering::SeqCst);
        crate::kill_pid_tree(pid);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_is_consistent() {
        let info = ollama_info();
        assert_eq!(info.installed, info.path.is_some());
        assert_eq!(info.can_install, cfg!(windows));
    }

    #[cfg(windows)]
    #[test]
    fn the_install_script_is_embedded_and_runs_for_the_app() {
        assert!(SCRIPT.contains("[switch]$ForApp"));
        assert!(SCRIPT.contains("Get-AuthenticodeSignature"));
    }
}
