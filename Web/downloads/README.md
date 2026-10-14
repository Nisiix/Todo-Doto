# Download

Quando il server web sarà pronto, copiare qui gli installer prodotti dalla build e un `manifest.json` con questa forma:

```json
{
  "version": "0.1.0",
  "date": "2026-10-14",
  "files": {
    "msi": { "name": "Project Goal Manager_0.1.0_x64_en-US.msi", "size": "12 MB", "sha256": "…" },
    "exe": { "name": "Project Goal Manager_0.1.0_x64-setup.exe", "size": "9 MB", "sha256": "…" }
  }
}
```

La pagina `index.html` legge il manifest e aggiorna i pulsanti di download; se il file manca, rimanda alle Release su GitHub.
