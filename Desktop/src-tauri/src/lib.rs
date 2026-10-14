//! Backend Tauri: il più sottile possibile. Tutta la logica applicativa vive nel
//! frontend; qui esponiamo l'identità locale (utente + macchina), un piccolo
//! ricevitore per il redirect OAuth di Google (loopback su 127.0.0.1) e i plugin
//! ufficiali per filesystem, dialog, http, apertura file e stato della finestra.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;

use serde::Serialize;

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

/// Attende una sola richiesta sulla porta aperta da `oauth_start`, risponde con
/// una pagina di conferma e restituisce codice e stato.
#[tauri::command]
async fn oauth_wait() -> Result<OAuthCallback, String> {
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

        let body = if cb.error.is_some() {
            "<h2>Accesso annullato</h2><p>Puoi chiudere questa finestra e tornare a Project Goal Manager.</p>"
        } else {
            "<h2>Account collegato</h2><p>Puoi chiudere questa finestra e tornare a Project Goal Manager.</p>"
        };
        let html = format!(
            "<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Project Goal Manager</title>\
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_identity, oauth_start, oauth_wait])
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
