//! Protezione dei segreti salvati su questo PC (password dei workspace).
//!
//! Su Windows si usa DPAPI (`CryptProtectData`): il dato cifrato si può
//! decifrare solo dallo stesso account Windows, sullo stesso PC. Anche
//! copiando il file delle credenziali su un'altra macchina, o leggendolo da un
//! altro utente, la password resta illeggibile. Nessuna chiave da custodire:
//! la gestisce il sistema operativo insieme alla password dell'utente.
//!
//! Sugli altri sistemi i comandi rispondono "non disponibile" e il frontend
//! ripiega sulla cifratura AES-GCM locale.

/// Entropia aggiuntiva: lega i dati a questa applicazione, così un altro
/// programma dello stesso utente che chiami DPAPI senza conoscerla non li apre.
#[cfg(windows)]
const ENTROPY: &[u8] = b"com.nisos.projectgoalmanager/credentials/v1";

#[cfg(windows)]
mod imp {
    use super::ENTROPY;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    /// Copia il risultato e libera la memoria allocata da Windows.
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as _);
        v
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(plain);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
        let ok = unsafe { CryptProtectData(&input, null(), &entropy, null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if ok == 0 {
            return Err(format!("DPAPI: cifratura non riuscita ({})", std::io::Error::last_os_error()));
        }
        Ok(unsafe { take(out) })
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
        let ok = unsafe { CryptUnprotectData(&input, null_mut(), &entropy, null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if ok == 0 {
            return Err(format!("DPAPI: decifratura non riuscita ({})", std::io::Error::last_os_error()));
        }
        Ok(unsafe { take(out) })
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
        Err("unsupported".into())
    }
    pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("unsupported".into())
    }
}

/// Cifra un testo per l'utente Windows corrente. Restituisce i byte cifrati.
#[tauri::command]
pub fn protect_secret(plain: String) -> Result<Vec<u8>, String> {
    imp::protect(plain.as_bytes())
}

/// Decifra un dato prodotto da `protect_secret` dallo stesso utente Windows.
#[tauri::command]
pub fn unprotect_secret(data: Vec<u8>) -> Result<String, String> {
    let plain = imp::unprotect(&data)?;
    String::from_utf8(plain).map_err(|_| "dato non valido".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn roundtrip_dpapi() {
        let c = protect_secret("segreto-è-123".into()).unwrap();
        assert!(!c.is_empty());
        assert_ne!(c, b"segreto-\xc3\xa8-123".to_vec());
        assert_eq!(unprotect_secret(c).unwrap(), "segreto-è-123");
        assert!(unprotect_secret(vec![1, 2, 3]).is_err());
    }

    #[cfg(not(windows))]
    #[test]
    fn unsupported_elsewhere() {
        assert_eq!(protect_secret("x".into()).unwrap_err(), "unsupported");
        assert_eq!(unprotect_secret(vec![1]).unwrap_err(), "unsupported");
    }
}
