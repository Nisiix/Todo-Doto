//! Integrazione con l'ufficio, tutta facoltativa e su comando dell'utente:
//!
//! - **VPN**: si usano le connessioni VPN già configurate in Windows (elenco con
//!   `Get-VpnConnection`, collegamento con `rasdial <nome>`). Il nome si
//!   accetta solo se è nell'elenco di Windows; niente shell, argomenti fissi.
//!   Le credenziali restano a Windows: Todo Doto non le vede mai.
//! - **Account di dominio**: utente, SID e gruppi dell'account Windows corrente
//!   (`whoami /user /groups`), per riconoscere la stessa persona su più PC e
//!   ricavare i ruoli dai gruppi di Active Directory.
//! - **Email**: invio con Outlook installato sul PC (automazione COM, parametri
//!   passati in variabili d'ambiente, mai nel testo dello script) oppure con il
//!   server SMTP aziendale (TLS di sistema).
//!
//! Fuori da Windows VPN, dominio e Outlook rispondono "unsupported".

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VpnInfo {
    pub name: String,
    pub connected: bool,
    /// Connessione per tutti gli utenti del PC (di solito distribuita dall'IT).
    pub all_users: bool,
}

#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DomainIdentity {
    /// Dominio (o "AzureAD" per gli account Microsoft Entra); vuoto per un account locale.
    pub domain: String,
    pub user: String,
    pub sid: String,
    /// Nomi dei gruppi (es. "STUDIO\\TodoDoto-Admin").
    pub groups: Vec<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub ok: bool,
    pub code: Option<i32>,
    pub message: String,
}

// --- esecuzione ------------------------------------------------------------------

#[cfg(windows)]
fn hidden(mut c: std::process::Command) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    c
}

/// Esegue un programma (senza shell) con un tempo massimo; codice e output.
#[cfg(windows)]
fn run(mut cmd: std::process::Command, timeout: Duration) -> Result<(Option<i32>, String, String), String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::Instant;
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut out = child.stdout.take();
    let mut err = child.stderr.take();
    let t_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_end(&mut b);
        }
        b
    });
    let t_err = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(e) = err.as_mut() {
            let _ = e.read_to_end(&mut b);
        }
        b
    });
    let started = Instant::now();
    let code = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s.code(),
            Ok(None) if started.elapsed() > timeout => {
                crate::kill_pid_tree(child.id());
                let _ = child.kill();
                return Err("timeout".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let decode = |b: Vec<u8>| String::from_utf8_lossy(&b).into_owned();
    Ok((code, decode(t_out.join().unwrap_or_default()), decode(t_err.join().unwrap_or_default())))
}

#[cfg(windows)]
fn powershell(script: &str) -> std::process::Command {
    let mut c = std::process::Command::new("powershell.exe");
    c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    hidden(c)
}

// --- VPN -------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PsVpn {
    name: String,
    #[serde(default)]
    connection_status: Option<serde_json::Value>,
    #[serde(default)]
    all_users: Option<bool>,
}

/// Interpreta l'output JSON di Get-VpnConnection (un oggetto o un array).
pub fn parse_vpn_json(text: &str) -> Vec<VpnInfo> {
    let t = text.trim();
    if t.is_empty() {
        return vec![];
    }
    let items: Vec<PsVpn> = if t.starts_with('[') {
        serde_json::from_str(t).unwrap_or_default()
    } else {
        serde_json::from_str::<PsVpn>(t).map(|v| vec![v]).unwrap_or_default()
    };
    let mut out: Vec<VpnInfo> = Vec::new();
    for v in items {
        let connected = match &v.connection_status {
            Some(serde_json::Value::String(s)) => s.eq_ignore_ascii_case("Connected"),
            Some(serde_json::Value::Number(n)) => n.as_i64() == Some(1),
            _ => false,
        };
        if v.name.trim().is_empty() || out.iter().any(|x| x.name == v.name) {
            continue;
        }
        out.push(VpnInfo { name: v.name, connected, all_users: v.all_users.unwrap_or(false) });
    }
    out
}

const VPN_LIST_PS: &str = "$ErrorActionPreference='SilentlyContinue'; \
$a=@(Get-VpnConnection | Select-Object Name,@{n='ConnectionStatus';e={[string]$_.ConnectionStatus}},@{n='AllUsers';e={$false}}); \
$b=@(Get-VpnConnection -AllUserConnection | Select-Object Name,@{n='ConnectionStatus';e={[string]$_.ConnectionStatus}},@{n='AllUsers';e={$true}}); \
ConvertTo-Json -Compress -InputObject @($a+$b)";

fn list_vpns() -> Result<Vec<VpnInfo>, String> {
    #[cfg(windows)]
    {
        let (_, out, _) = run(powershell(VPN_LIST_PS), Duration::from_secs(20))?;
        Ok(parse_vpn_json(&out))
    }
    #[cfg(not(windows))]
    Err("unsupported".into())
}

#[tauri::command]
pub async fn vpn_list() -> Result<Vec<VpnInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_vpns).await.map_err(|e| e.to_string())?
}

/// Collega la VPN `name` (solo un nome presente nell'elenco di Windows) con rasdial,
/// che usa le credenziali salvate in Windows. Codici rasdial noti: 691/703 =
/// servono credenziali (si apre il pannello VPN di Windows dal frontend).
#[tauri::command]
pub async fn vpn_connect(name: String) -> Result<ActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let known = list_vpns()?;
        let Some(v) = known.iter().find(|v| v.name == name) else {
            return Err("unknown-vpn".to_string());
        };
        if v.connected {
            return Ok(ActionResult { ok: true, code: Some(0), message: "already".into() });
        }
        #[cfg(windows)]
        {
            let mut c = std::process::Command::new("rasdial.exe");
            c.arg(&v.name);
            let (code, out, err) = run(hidden(c), Duration::from_secs(60))?;
            let message = format!("{}{}", out.trim(), if err.trim().is_empty() { String::new() } else { format!("\n{}", err.trim()) });
            Ok(ActionResult { ok: code == Some(0), code, message: message.chars().take(2000).collect() })
        }
        #[cfg(not(windows))]
        Err("unsupported".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- account di dominio -----------------------------------------------------------

/// Campi di una riga CSV di whoami ("a","b","c").
fn csv_fields(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut chars = line.trim().chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => out.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out
}

/// Da `whoami /user /fo csv /nh` e `whoami /groups /fo csv /nh`; `computer` è il nome del PC
/// (un "dominio" uguale al nome del PC indica un account locale).
pub fn parse_whoami(user_csv: &str, groups_csv: &str, computer: &str) -> DomainIdentity {
    let Some(line) = user_csv.lines().find(|l| l.trim().starts_with('"')) else {
        return DomainIdentity::default();
    };
    let f = csv_fields(line);
    let full = f.first().cloned().unwrap_or_default();
    let sid = f.get(1).cloned().unwrap_or_default();
    let (domain, user) = match full.split_once('\\') {
        Some((d, u)) => (d.to_string(), u.to_string()),
        None => (String::new(), full.clone()),
    };
    let local = domain.is_empty() || domain.eq_ignore_ascii_case(computer);
    let groups = groups_csv
        .lines()
        .filter(|l| l.trim().starts_with('"'))
        .filter_map(|l| csv_fields(l).into_iter().next())
        .filter(|g| g.contains('\\'))
        .filter(|g| {
            let d = g.split('\\').next().unwrap_or("").to_ascii_uppercase();
            !matches!(d.as_str(), "BUILTIN" | "NT AUTHORITY" | "AUTORITA NT" | "AUTORITÀ NT" | "NT-AUTORITÄT" | "AUTORITE NT" | "AUTORITÉ NT" | "MANDATORY LABEL" | "ETICHETTA OBBLIGATORIA")
                && !d.eq_ignore_ascii_case(computer)
        })
        .collect();
    DomainIdentity { domain: if local { String::new() } else { domain }, user, sid: if sid.starts_with("S-1-") { sid } else { String::new() }, groups }
}

#[tauri::command]
pub async fn domain_identity() -> Result<DomainIdentity, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let whoami = |arg: &str| -> Result<String, String> {
                let mut c = std::process::Command::new("whoami.exe");
                c.args([arg, "/fo", "csv", "/nh"]);
                Ok(run(hidden(c), Duration::from_secs(15))?.1)
            };
            let computer = std::env::var("COMPUTERNAME").unwrap_or_default();
            Ok(parse_whoami(&whoami("/user")?, &whoami("/groups")?, &computer))
        }
        #[cfg(not(windows))]
        Err("unsupported".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- email -------------------------------------------------------------------------

/// Indirizzo email plausibile (niente spazi, a capo o separatori multipli).
pub fn valid_email(s: &str) -> bool {
    let s = s.trim();
    let Some((local, domain)) = s.split_once('@') else { return false };
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && s.len() <= 254
        && s.chars().all(|c| c.is_ascii_alphanumeric() || "._%+-@'".contains(c))
        && !domain.contains('@')
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    pub to: Vec<String>,
    pub subject: String,
    pub html: String,
    pub text: String,
}

fn check_message(m: &MailMessage) -> Result<(), String> {
    if m.to.is_empty() || m.to.len() > 200 || !m.to.iter().all(|t| valid_email(t)) {
        return Err("invalid-recipient".into());
    }
    if m.subject.contains(['\r', '\n']) || m.subject.len() > 300 || m.html.len() > 512_000 || m.text.len() > 256_000 {
        return Err("invalid-message".into());
    }
    Ok(())
}

const OUTLOOK_PS: &str = "$ErrorActionPreference='Stop'; \
$o = New-Object -ComObject Outlook.Application; $m = $o.CreateItem(0); \
$m.To = $env:PGM_MAIL_TO; $m.Subject = $env:PGM_MAIL_SUBJECT; $m.HTMLBody = $env:PGM_MAIL_HTML; $m.Send(); 'ok'";

/// Invio con Outlook installato su questo PC (dall'account di chi è collegato).
#[tauri::command]
pub async fn mail_outlook(message: MailMessage) -> Result<ActionResult, String> {
    check_message(&message)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut c = powershell(OUTLOOK_PS);
            c.env("PGM_MAIL_TO", message.to.join("; "));
            c.env("PGM_MAIL_SUBJECT", &message.subject);
            c.env("PGM_MAIL_HTML", &message.html);
            let (code, out, err) = run(c, Duration::from_secs(90))?;
            let ok = code == Some(0) && out.contains("ok");
            Ok(ActionResult { ok, code, message: if ok { String::new() } else { err.trim().chars().take(1000).collect() } })
        }
        #[cfg(not(windows))]
        {
            let _ = message;
            Err("unsupported".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    /// "starttls" | "tls" | "none" (solo rete interna).
    pub security: String,
    pub from: String,
    pub user: String,
    pub password: String,
}

/// Invio con il server SMTP aziendale.
#[tauri::command]
pub async fn mail_smtp(config: SmtpConfig, message: MailMessage) -> Result<ActionResult, String> {
    use lettre::message::{header::ContentType, Mailbox, MultiPart, SinglePart};
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{SmtpTransport, Transport};
    check_message(&message)?;
    if !valid_email(&config.from) || config.host.trim().is_empty() || config.host.contains(['/', ' ', '\\']) {
        return Err("invalid-config".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let parse = |s: &str| s.trim().parse::<Mailbox>().map_err(|e| e.to_string());
        let mut b = lettre::Message::builder().from(parse(&config.from)?).subject(message.subject.clone());
        for t in &message.to {
            b = b.to(parse(t)?);
        }
        let email = b
            .multipart(
                MultiPart::alternative()
                    .singlepart(SinglePart::builder().header(ContentType::TEXT_PLAIN).body(message.text.clone()))
                    .singlepart(SinglePart::builder().header(ContentType::TEXT_HTML).body(message.html.clone())),
            )
            .map_err(|e| e.to_string())?;
        let host = config.host.trim();
        let builder = match config.security.as_str() {
            "tls" => SmtpTransport::relay(host).map_err(|e| e.to_string())?,
            "none" => SmtpTransport::builder_dangerous(host),
            _ => SmtpTransport::starttls_relay(host).map_err(|e| e.to_string())?,
        };
        let mut builder = builder.port(config.port).timeout(Some(Duration::from_secs(30)));
        if !config.user.is_empty() {
            builder = builder.credentials(Credentials::new(config.user.clone(), config.password.clone()));
        }
        match builder.build().send(&email) {
            Ok(_) => Ok(ActionResult { ok: true, code: Some(0), message: String::new() }),
            Err(e) => Ok(ActionResult { ok: false, code: None, message: e.to_string().chars().take(1000).collect() }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vpn_list() {
        let json = r#"[{"Name":"Ufficio","ConnectionStatus":"Connected","AllUsers":true},{"Name":"Cliente","ConnectionStatus":"Disconnected","AllUsers":false},{"Name":"Ufficio","ConnectionStatus":"Disconnected","AllUsers":false}]"#;
        let v = parse_vpn_json(json);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0], VpnInfo { name: "Ufficio".into(), connected: true, all_users: true });
        assert!(!v[1].connected);
        assert_eq!(parse_vpn_json(r#"{"Name":"Sola","ConnectionStatus":"Connected"}"#).len(), 1);
        assert!(parse_vpn_json("").is_empty());
    }

    #[test]
    fn parses_domain_identity() {
        let user = "\"studio\\mario.rossi\",\"S-1-5-21-1-2-3-1104\"\r\n";
        let groups = "\"Everyone\",\"Well-known group\",\"S-1-1-0\",\"Mandatory group\"\n\"BUILTIN\\Users\",\"Alias\",\"S-1-5-32-545\",\"x\"\n\"STUDIO\\TodoDoto-Admin\",\"Group\",\"S-1-5-21-9\",\"x\"\n\"NT AUTHORITY\\INTERACTIVE\",\"x\",\"x\",\"x\"\n";
        let id = parse_whoami(user, groups, "PC-MARIO");
        assert_eq!(id.domain, "studio");
        assert_eq!(id.user, "mario.rossi");
        assert_eq!(id.sid, "S-1-5-21-1-2-3-1104");
        assert_eq!(id.groups, vec!["STUDIO\\TodoDoto-Admin".to_string()]);
        // Account locale: il "dominio" è il nome del PC
        let local = parse_whoami("\"pc-mario\\mario\",\"S-1-5-21-5-1001\"", "", "PC-MARIO");
        assert_eq!(local.domain, "");
        assert_eq!(local.user, "mario");
    }

    #[test]
    fn validates_emails() {
        assert!(valid_email("mario.rossi@studio.it"));
        assert!(!valid_email("mario rossi@studio.it"));
        assert!(!valid_email("mario@studio"));
        assert!(!valid_email("a@b.it\r\nBcc: x@y.it"));
        assert!(!valid_email("a@b@c.it"));
    }
}
