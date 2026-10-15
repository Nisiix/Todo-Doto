# Download

`manifest.json` viene generato dal workflow `.github/workflows/site.yml` a ogni Release pubblicata, leggendo gli asset della Release su GitHub (nome, URL, dimensione) e le impronte da `SHA256SUMS.txt`:

```json
{
  "version": "0.2.0",
  "date": "2026-10-20",
  "files": {
    "msi": { "name": "Project Goal Manager_0.2.0_x64_en-US.msi", "url": "https://github.com/...", "size": "2.0 MB", "sha256": "..." },
    "exe": { "name": "Project Goal Manager_0.2.0_x64-setup.exe", "url": "https://github.com/...", "size": "1.4 MB", "sha256": "..." }
  }
}
```

`index.html` legge il manifest e aggiorna pulsanti, versione e impronte; se il file manca, i pulsanti rimandano alle Release su GitHub. Per servire i file da un proprio server, copiarli in questa cartella e omettere `url` nel manifest.
