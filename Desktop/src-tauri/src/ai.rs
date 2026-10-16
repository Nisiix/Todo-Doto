//! IA locale: richieste HTTP verso un motore installato sul PC (Ollama, LM
//! Studio, Foundry Local…). Si accettano SOLO indirizzi di loopback
//! (127.0.0.1, ::1, localhost risolto sempre su 127.0.0.1): nessuna richiesta
//! può uscire dal PC. Niente proxy di sistema, niente redirect (un redirect
//! potrebbe portare fuori), dimensione massima della risposta.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::time::Duration;

use reqwest::Url;
use serde::{Deserialize, Serialize};

/// Risposta più grande accettata (le liste di embedding possono pesare qualche MB).
const MAX_BODY: usize = 32 * 1024 * 1024;
/// Riga più lunga accettata nelle risposte in streaming (NDJSON).
const MAX_LINE: usize = 1024 * 1024;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    /// Corpo JSON già serializzato.
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub status: u16,
    pub body: String,
}

/// Indirizzo accettato solo se punta a questo PC. Errore "not-local" altrimenti.
pub fn check_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "bad-url".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("not-local".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("not-local".into());
    }
    let ok = match url.host() {
        Some(url::Host::Domain(d)) => d.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    };
    if ok {
        Ok(url)
    } else {
        Err("not-local".into())
    }
}

fn client(url: &Url, timeout: Option<Duration>) -> Result<reqwest::Client, String> {
    let port = url.port_or_known_default().unwrap_or(80);
    let mut b = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        // "localhost" non passa dal DNS né dal file hosts: sempre 127.0.0.1
        .resolve("localhost", SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port));
    if let Some(t) = timeout {
        b = b.timeout(t);
    }
    b.build().map_err(|e| e.to_string())
}

fn build(req: &AiRequest, timeout: Option<Duration>) -> Result<reqwest::RequestBuilder, String> {
    let url = check_url(&req.url)?;
    let c = client(&url, timeout)?;
    let method = req.method.as_deref().unwrap_or(if req.body.is_some() { "POST" } else { "GET" });
    let rb = match method.to_ascii_uppercase().as_str() {
        "GET" => c.get(url),
        "POST" => c.post(url),
        "DELETE" => c.delete(url),
        _ => return Err("bad-method".into()),
    };
    Ok(match &req.body {
        Some(b) => rb.header("content-type", "application/json").body(b.clone()),
        None => rb,
    })
}

fn explain(e: reqwest::Error) -> String {
    if e.is_connect() {
        "unreachable".into()
    } else if e.is_timeout() {
        "timeout".into()
    } else {
        e.to_string()
    }
}

/// Richiesta singola: stato e corpo (testo) della risposta.
pub async fn request(req: AiRequest) -> Result<AiResponse, String> {
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(120_000).clamp(1_000, 900_000));
    let mut resp = build(&req, Some(timeout))?.send().await.map_err(explain)?;
    let status = resp.status().as_u16();
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(explain)? {
        if body.len() + chunk.len() > MAX_BODY {
            return Err("too-large".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(AiResponse { status, body: String::from_utf8_lossy(&body).into_owned() })
}

static CANCELLED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn is_cancelled(id: &str) -> bool {
    CANCELLED.lock().ok().and_then(|g| g.as_ref().map(|s| s.contains(id))).unwrap_or(false)
}

fn clear_cancel(id: &str) {
    if let Ok(mut g) = CANCELLED.lock() {
        if let Some(s) = g.as_mut() {
            s.remove(id);
        }
    }
}

/// Risposta in streaming riga per riga (NDJSON, es. lo scaricamento di un
/// modello con Ollama): ogni riga va a `on_line`. Tra un pezzo e l'altro si
/// aspettano al massimo `timeout_ms` (default 2 minuti), non c'è un limite totale.
pub async fn stream<F: FnMut(String)>(req: AiRequest, id: &str, mut on_line: F) -> Result<u16, String> {
    let idle = Duration::from_millis(req.timeout_ms.unwrap_or(120_000).clamp(1_000, 900_000));
    let send = build(&req, None)?.send();
    let mut resp = tokio::time::timeout(idle, send).await.map_err(|_| "timeout".to_string())?.map_err(explain)?;
    let status = resp.status().as_u16();
    let mut pending: Vec<u8> = Vec::new();
    loop {
        if is_cancelled(id) {
            clear_cancel(id);
            return Err("cancelled".into());
        }
        let next = tokio::time::timeout(idle, resp.chunk()).await.map_err(|_| "timeout".to_string())?.map_err(explain)?;
        let Some(chunk) = next else { break };
        pending.extend_from_slice(&chunk);
        while let Some(pos) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = pending.drain(..=pos).collect();
            let text = String::from_utf8_lossy(&line).trim().to_string();
            if !text.is_empty() {
                on_line(text);
            }
        }
        if pending.len() > MAX_LINE {
            return Err("too-large".into());
        }
    }
    let rest = String::from_utf8_lossy(&pending).trim().to_string();
    if !rest.is_empty() {
        on_line(rest);
    }
    clear_cancel(id);
    Ok(status)
}

#[tauri::command]
pub async fn ai_request(req: AiRequest) -> Result<AiResponse, String> {
    request(req).await
}

#[tauri::command]
pub async fn ai_stream(req: AiRequest, id: String, on_line: tauri::ipc::Channel<String>) -> Result<u16, String> {
    stream(req, &id, |line| {
        let _ = on_line.send(line);
    })
    .await
}

/// Interrompe uno streaming in corso (es. "Annulla" durante lo scaricamento del modello).
#[tauri::command]
pub fn ai_cancel(id: String) {
    if let Ok(mut g) = CANCELLED.lock() {
        g.get_or_insert_with(HashSet::new).insert(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn accepts_only_loopback_addresses() {
        for ok in [
            "http://127.0.0.1:11434/api/tags",
            "http://localhost:1234/v1/models",
            "http://LOCALHOST:1234",
            "http://[::1]:11434/api/chat",
            "http://127.0.0.2:8080/",
            "https://127.0.0.1:5273/v1",
        ] {
            assert!(check_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://192.168.1.10:11434/api/tags",
            "http://10.0.0.1/",
            "https://ollama.com/api/tags",
            "http://localhost.evil.com/",
            "http://127.0.0.1.nip.io/",
            "http://user:pw@127.0.0.1:11434/",
            "file:///etc/passwd",
            "ftp://127.0.0.1/",
            "http://[::ffff:8.8.8.8]/",
            "http://0.0.0.0:11434/",
            "non un indirizzo",
        ] {
            assert!(check_url(bad).is_err(), "{bad}");
        }
    }

    /// Server di prova su 127.0.0.1: risponde una volta con `response`.
    fn serve_once(response: String) -> (u16, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let n = s.read(&mut buf).unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).into_owned();
            s.write_all(response.as_bytes()).unwrap();
            s.flush().unwrap();
            req
        });
        (port, h)
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
    }

    #[test]
    fn sends_json_and_reads_the_answer() {
        let body = "{\"ok\":true}";
        let (port, h) = serve_once(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()));
        let r = rt()
            .block_on(request(AiRequest {
                url: format!("http://localhost:{port}/api/chat"),
                method: None,
                body: Some("{\"model\":\"qwen3:4b\"}".into()),
                timeout_ms: Some(5_000),
            }))
            .unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.body, body);
        let sent = h.join().unwrap();
        assert!(sent.starts_with("POST /api/chat"));
        assert!(sent.contains("qwen3:4b"));
    }

    #[test]
    fn does_not_follow_redirects() {
        let (port, h) = serve_once("HTTP/1.1 302 Found\r\nLocation: https://example.com/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into());
        let r = rt()
            .block_on(request(AiRequest { url: format!("http://127.0.0.1:{port}/"), method: Some("GET".into()), body: None, timeout_ms: Some(5_000) }))
            .unwrap();
        assert_eq!(r.status, 302);
        h.join().unwrap();
    }

    #[test]
    fn refuses_remote_hosts_before_connecting() {
        let e = rt()
            .block_on(request(AiRequest { url: "http://93.184.216.34/".into(), method: None, body: None, timeout_ms: None }))
            .unwrap_err();
        assert_eq!(e, "not-local");
    }

    #[test]
    fn streams_lines_and_reports_unreachable_servers() {
        let lines = "{\"status\":\"pulling\"}\n{\"status\":\"pulling\",\"completed\":5,\"total\":10}\n{\"status\":\"success\"}";
        let (port, h) = serve_once(format!("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{lines}", lines.len()));
        let mut got = Vec::new();
        let status = rt()
            .block_on(stream(
                AiRequest { url: format!("http://127.0.0.1:{port}/api/pull"), method: None, body: Some("{}".into()), timeout_ms: Some(5_000) },
                "t1",
                |l| got.push(l),
            ))
            .unwrap();
        h.join().unwrap();
        assert_eq!(status, 200);
        assert_eq!(got.len(), 3);
        assert!(got[2].contains("success"));
        // Porta chiusa: "unreachable", non un errore generico
        let free = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let e = rt()
            .block_on(request(AiRequest { url: format!("http://127.0.0.1:{free}/"), method: None, body: None, timeout_ms: Some(3_000) }))
            .unwrap_err();
        assert_eq!(e, "unreachable");
    }
}
