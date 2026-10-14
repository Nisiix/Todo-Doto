# Download

Quando il server web sarà pronto, copiare qui gli installer prodotti dalla build (uno per lingua) e un `manifest.json` con questa forma:

```json
{
  "version": "0.1.0",
  "date": "2026-10-14",
  "files": {
    "it": {
      "msi": { "name": "Project-Goal-Manager_0.1.0_x64_it.msi", "size": "12 MB", "sha256": "…" },
      "exe": { "name": "Project-Goal-Manager_0.1.0_x64_it-setup.exe", "size": "9 MB", "sha256": "…" }
    },
    "en": {
      "msi": { "name": "Project-Goal-Manager_0.1.0_x64_en.msi", "size": "12 MB", "sha256": "…" },
      "exe": { "name": "Project-Goal-Manager_0.1.0_x64_en-setup.exe", "size": "9 MB", "sha256": "…" }
    }
  }
}
```

La pagina `index.html` propone l'installer nella lingua scelta per il sito (IT/EN in alto). Fonti, in ordine:

1. questo `manifest.json` (`files.<lingua>`; il vecchio formato senza lingua vale per l'italiano);
2. l'ultima Release su GitHub, cercando gli asset `…_<lingua>.msi` e `…_<lingua>-setup.exe` prodotti dal workflow `build-windows.yml`;
3. la pagina delle Release su GitHub.
