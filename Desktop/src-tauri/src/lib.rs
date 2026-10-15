//! Backend Tauri: il più sottile possibile. Tutta la logica applicativa vive nel
//! frontend; qui esponiamo l'identità locale (utente + macchina), un piccolo
//! ricevitore per il redirect OAuth di Google (loopback su 127.0.0.1) e i plugin
//! ufficiali per filesystem, dialog, http, apertura file e stato della finestra.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;

use serde::Serialize;

mod secrets;
mod git;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    username: String,
    hostname: String,
}

/// Nome utente del sistema operativo e nome della macchina: insieme formano
/// l'identità con cui l'utente compare nel workspace condiviso.
#[tauri::command]
fn get_identity() -> Identity {
    let username = whoami::username();
    let hostname = whoami::fallible::hostname().unwrap_or_else(|_| "PC".to_string());
    Identity {
        username,
        hostname: hostname.to_uppercase(),
    }
}

// ---------------------------------------------------------------------------
// OAuth loopback: Google rimanda il browser su http://127.0.0.1:<porta>/callback
// con il codice di autorizzazione; qui lo intercettiamo e lo passiamo al frontend.
// ---------------------------------------------------------------------------

static OAUTH_LISTENER: Mutex<Option<TcpListener>> = Mutex::new(None);

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct OAuthCallback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// Apre una porta libera su 127.0.0.1 e la restituisce; la richiesta successiva
/// `oauth_wait` resta in attesa del redirect su quella porta.
#[tauri::command]
fn oauth_start() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    *OAUTH_LISTENER.lock().map_err(|e| e.to_string())? = Some(listener);
    Ok(port)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_callback(request_line: &str) -> OAuthCallback {
    // "GET /callback?code=...&state=... HTTP/1.1"
    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut cb = OAuthCallback::default();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let v = percent_decode(v);
            match k {
                "code" => cb.code = Some(v),
                "state" => cb.state = Some(v),
                "error" => cb.error = Some(v),
                _ => {}
            }
        }
    }
    cb
}

/// Pagina mostrata nel browser al termine dell'accesso a Google, nella lingua
/// dell'interfaccia (`locale` arriva dal frontend): (lang, corpo HTML).
fn oauth_page(locale: &str, cancelled: bool) -> (&'static str, &'static str) {
    let en = locale.eq_ignore_ascii_case("en");
    match (en, cancelled) {
        (true, true) => ("en", "<h2>Access cancelled</h2><p>You can close this window and go back to Project Goal Manager.</p>"),
        (true, false) => ("en", "<h2>Account connected</h2><p>You can close this window and go back to Project Goal Manager.</p>"),
        (false, true) => ("it", "<h2>Accesso annullato</h2><p>Puoi chiudere questa finestra e tornare a Project Goal Manager.</p>"),
        (false, false) => ("it", "<h2>Account collegato</h2><p>Puoi chiudere questa finestra e tornare a Project Goal Manager.</p>"),
    }
}

/// Attende una sola richiesta sulla porta aperta da `oauth_start`, risponde con
/// una pagina di conferma e restituisce codice e stato.
#[tauri::command]
async fn oauth_wait(locale: Option<String>) -> Result<OAuthCallback, String> {
    let locale = locale.unwrap_or_else(|| "it".to_string());
    let listener = OAUTH_LISTENER
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or_else(|| "Chiama prima oauth_start".to_string())?;

    tauri::async_runtime::spawn_blocking(move || -> Result<OAuthCallback, String> {
        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        let request = String::from_utf8_lossy(&buf[..n]);
        let first_line = request.lines().next().unwrap_or("");
        let cb = parse_callback(first_line);

        let (lang, body) = oauth_page(&locale, cb.error.is_some());
        let html = format!(
            "<!doctype html><html lang=\"{lang}\"><meta charset=\"utf-8\"><title>Project Goal Manager</title>\
             <body style=\"font-family:system-ui;padding:40px;color:#1c1f26\">{body}</body></html>"
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        Ok(cb)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Verifica dei prerequisiti (Stack › Configura sul tuo PC): esegue il comando di
// verifica (es. `node -v`) senza finestre, con un tempo massimo, in una cartella
// neutra e con il PATH aggiornato, così si vede anche ciò che è stato installato
// dopo l'avvio dell'app. Quali comandi eseguire lo decide il frontend.
// ---------------------------------------------------------------------------

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct CheckOutput {
    /// Codice d'uscita (None se il processo è stato interrotto).
    code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    /// Il comando non è partito affatto (es. shell non disponibile).
    spawn_error: Option<String>,
}

/// Espande le variabili `%NOME%` dei valori REG_EXPAND_SZ.
#[cfg(windows)]
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                match std::env::var(name) {
                    Ok(v) if !name.is_empty() => out.push_str(&v),
                    _ => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// PATH come lo vedrebbe un nuovo prompt dei comandi: sistema + utente (dal
/// registro) + quello del processo, senza duplicati.
#[cfg(windows)]
pub(crate) fn fresh_path() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let read = |root: RegKey, key: &str| -> String {
        root.open_subkey(key)
            .and_then(|k| k.get_value::<String, _>("Path"))
            .unwrap_or_default()
    };
    let system = read(
        RegKey::predef(HKEY_LOCAL_MACHINE),
        r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
    );
    let user = read(RegKey::predef(HKEY_CURRENT_USER), "Environment");
    let process = std::env::var("PATH").unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::new();
    for part in [system, user, process].iter().flat_map(|p| p.split(';').map(expand_env).collect::<Vec<_>>()) {
        let p = part.trim().to_string();
        if !p.is_empty() && seen.insert(p.to_lowercase()) {
            parts.push(p);
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(";"))
    }
}

fn shell_command(command: &str) -> std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("cmd");
        // /S: cmd toglie solo le virgolette esterne ed esegue il resto così com'è
        c.raw_arg(format!("/D /S /C \"{command}\""));
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        if let Some(path) = fresh_path() {
            c.env("PATH", path);
        }
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = std::process::Command::new("sh");
        c.arg("-lc").arg(command);
        c
    }
}

fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .creation_flags(0x0800_0000)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn run_check_blocking(command: &str, timeout: std::time::Duration) -> CheckOutput {
    use std::process::Stdio;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    let mut cmd = shell_command(command);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.current_dir(std::env::temp_dir());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return CheckOutput {
                spawn_error: Some(e.to_string()),
                ..Default::default()
            }
        }
    };

    // Lettura dell'output in thread separati: un programma che scrive molto non si blocca
    let pipe = |r: Option<Box<dyn Read + Send>>| {
        let (tx, rx) = mpsc::channel::<String>();
        if let Some(mut r) = r {
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                let _ = r.read_to_end(&mut buf);
                let _ = tx.send(String::from_utf8_lossy(&buf).into_owned());
            });
        }
        rx
    };
    let out_rx = pipe(child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>));
    let err_rx = pipe(child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>));

    let started = Instant::now();
    let mut timed_out = false;
    let code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) if started.elapsed() >= timeout => {
                timed_out = true;
                kill_tree(&mut child);
                break None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => {
                kill_tree(&mut child);
                return CheckOutput {
                    spawn_error: Some(e.to_string()),
                    ..Default::default()
                };
            }
        }
    };
    let grace = Duration::from_millis(1500);
    let limit = |s: String| s.chars().take(4000).collect::<String>();
    CheckOutput {
        code,
        stdout: limit(out_rx.recv_timeout(grace).unwrap_or_default()),
        stderr: limit(err_rx.recv_timeout(grace).unwrap_or_default()),
        timed_out,
        spawn_error: None,
    }
}

/// Esegue un comando di verifica e ne restituisce codice d'uscita e output.
#[tauri::command]
async fn run_check(command: String, timeout_ms: Option<u64>) -> Result<CheckOutput, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(20_000).clamp(1_000, 120_000));
    tauri::async_runtime::spawn_blocking(move || run_check_blocking(&command, timeout))
        .await
        .map_err(|e| e.to_string())
}

/// Aggiunge cartelle (con tutto il contenuto) ai percorsi consentiti del plugin
/// fs. Serve ai percorsi di rete (\\server\condivisione) e alle unità mappate
/// riaperti dopo un riavvio, che non passano dalla finestra "Sfoglia" (la quale
/// li consente da sola) e che i modelli statici potrebbero non riconoscere.
#[tauri::command]
fn allow_paths(app: tauri::AppHandle, paths: Vec<String>) {
    use tauri_plugin_fs::FsExt;
    if let Some(scope) = app.try_fs_scope() {
        for p in paths {
            let _ = scope.allow_directory(&p, true);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_identity,
            oauth_start,
            oauth_wait,
            run_check,
            allow_paths,
            secrets::protect_secret,
            secrets::unprotect_secret,
            git::git_log
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Project Goal Manager");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_code_and_state() {
        let cb = parse_callback("GET /callback?state=abc&code=4%2FxyZ-123&scope=drive HTTP/1.1");
        assert_eq!(cb.code.as_deref(), Some("4/xyZ-123"));
        assert_eq!(cb.state.as_deref(), Some("abc"));
        assert!(cb.error.is_none());
    }

    #[test]
    fn parses_error() {
        let cb = parse_callback("GET /callback?error=access_denied&state=s HTTP/1.1");
        assert_eq!(cb.error.as_deref(), Some("access_denied"));
        assert!(cb.code.is_none());
    }
}
