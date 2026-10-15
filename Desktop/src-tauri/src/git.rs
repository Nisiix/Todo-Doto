//! Lettura dei commit di un repository git, in sola lettura, per chiudere i
//! task citati nei messaggi ("chiude TODO-12"). Si esegue `git` direttamente
//! (niente shell, argomenti fissi), senza finestra e con un tempo massimo.
//! Non si scrive mai nulla nel repository.

use serde::Serialize;
use std::io::Read;
use std::time::{Duration, Instant};

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    /// Data dell'autore, ISO 8601.
    pub date: String,
    /// Messaggio completo (oggetto e corpo).
    pub message: String,
}

const FIELD: char = '\u{1f}';
const RECORD: char = '\u{1e}';

/// Interpreta l'output di `git log --format=%H%x1f%an%x1f%aI%x1f%B%x1e`.
pub fn parse_log(out: &str) -> Vec<GitCommit> {
    out.split(RECORD)
        .filter_map(|rec| {
            let rec = rec.trim_start_matches(['\n', '\r']);
            let mut f = rec.splitn(4, FIELD);
            let hash = f.next()?.trim().to_string();
            if hash.len() < 7 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
                return None;
            }
            Some(GitCommit {
                hash,
                author: f.next().unwrap_or("").trim().to_string(),
                date: f.next().unwrap_or("").trim().to_string(),
                message: f.next().unwrap_or("").trim().to_string(),
            })
        })
        .collect()
}

fn git_command() -> std::process::Command {
    let mut c = std::process::Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        if let Some(path) = crate::fresh_path() {
            c.env("PATH", path);
        }
    }
    c
}

/// Ultimi `max` commit del ramo corrente del repository in `repo`.
/// Errore "git-missing" se git non è installato (il frontend legge allora
/// il reflog di .git), altrimenti il messaggio di git.
pub fn log(repo: &str, max: u32, timeout: Duration) -> Result<Vec<GitCommit>, String> {
    use std::process::Stdio;
    let mut cmd = git_command();
    cmd.args([
        // Cartelle di rete o di altri utenti: git le rifiuterebbe ("dubious ownership").
        // Vale solo per questo comando, che legge e basta.
        "-c",
        "safe.directory=*",
        "-c",
        "core.quotepath=off",
        "-C",
        repo,
        "log",
        "-n",
        &max.clamp(1, 2000).to_string(),
        "--no-color",
        "--format=%H%x1f%an%x1f%aI%x1f%B%x1e",
    ]);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "git-missing".to_string()
        } else {
            e.to_string()
        }
    })?;
    let mut stdout = child.stdout.take();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(s) = stdout.as_mut() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let mut stderr = child.stderr.take();
    let err_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(s) = stderr.as_mut() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("git: nessuna risposta in tempo".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(30)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let out = reader.join().unwrap_or_default();
    let err = err_reader.join().unwrap_or_default();
    if !status.success() {
        let msg = String::from_utf8_lossy(&err).trim().to_string();
        return Err(if msg.is_empty() { format!("git: codice {:?}", status.code()) } else { msg });
    }
    Ok(parse_log(&String::from_utf8_lossy(&out)))
}

#[tauri::command]
pub async fn git_log(repo: String, max: Option<u32>) -> Result<Vec<GitCommit>, String> {
    tauri::async_runtime::spawn_blocking(move || log(&repo, max.unwrap_or(300), Duration::from_secs(15)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_records_with_multiline_messages() {
        let out = format!(
            "a1b2c3d4e5f6{f}Mario Rossi{f}2026-10-15T10:00:00+02:00{f}Export XBRL\n\nchiude TODO-12\n{r}\n\
             0123456789ab{f}Anna{f}2026-10-14T09:00:00+02:00{f}fix login{r}\n",
            f = FIELD,
            r = RECORD
        );
        let c = parse_log(&out);
        assert_eq!(c.len(), 2);
        assert_eq!(c[0].hash, "a1b2c3d4e5f6");
        assert_eq!(c[0].author, "Mario Rossi");
        assert_eq!(c[0].message, "Export XBRL\n\nchiude TODO-12");
        assert_eq!(c[1].message, "fix login");
    }

    #[test]
    fn ignores_garbage() {
        assert!(parse_log("").is_empty());
        assert!(parse_log("non un hash\u{1f}x\u{1f}y\u{1f}z\u{1e}").is_empty());
    }

    #[test]
    fn reads_a_real_repository_when_git_is_installed() {
        let dir = std::env::temp_dir().join(format!("pgm-git-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let git = |args: &[&str]| std::process::Command::new("git").current_dir(&dir).args(args).output();
        if git(&["init", "-q"]).is_err() {
            return; // git non installato su questa macchina: niente da verificare
        }
        let _ = git(&["-c", "user.name=Test", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "Primo\n\nchiude TODO-3"]);
        let commits = log(dir.to_str().unwrap(), 10, Duration::from_secs(10)).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].author, "Test");
        assert!(commits[0].message.contains("chiude TODO-3"));
        let _ = std::fs::remove_dir_all(&dir);
        // Cartella che non è un repository: errore di git, non un elenco vuoto
        let plain = std::env::temp_dir().join(format!("pgm-not-git-{}", std::process::id()));
        std::fs::create_dir_all(&plain).unwrap();
        assert!(log(plain.to_str().unwrap(), 10, Duration::from_secs(10)).is_err());
        let _ = std::fs::remove_dir_all(&plain);
    }
}
