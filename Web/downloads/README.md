# Download

Quando il server web sarà pronto, copiare qui gli installer e gli eseguibili portabili prodotti dalla build (uno per lingua) e un `manifest.json` con questa forma:

```json
{
  "version": "0.2.1",
  "date": "2026-10-14",
  "files": {
    "it": {
      "msi": { "name": "Todo-Doto_0.2.1_x64_it.msi", "size": "4 MB", "sha256": "…" },
      "exe": { "name": "Todo-Doto_0.2.1_x64_it-setup.exe", "size": "3 MB", "sha256": "…" },
      "portable": { "name": "Todo-Doto_0.2.1_x64_it-portable.exe", "size": "7 MB", "sha256": "…" }
    },
    "en": {
      "msi": { "name": "Todo-Doto_0.2.1_x64_en.msi", "size": "4 MB", "sha256": "…" },
      "exe": { "name": "Todo-Doto_0.2.1_x64_en-setup.exe", "size": "3 MB", "sha256": "…" },
      "portable": { "name": "Todo-Doto_0.2.1_x64_en-portable.exe", "size": "7 MB", "sha256": "…" }
    }
  }
}
```

La pagina `index.html` propone i file nella lingua scelta per il sito (IT/EN in alto): setup `.exe`, `.msi` ed eseguibile portabile (senza installazione). Fonti, in ordine:

1. questo `manifest.json` (`files.<lingua>`; il vecchio formato senza lingua vale per l'italiano);
2. l'ultima Release su GitHub, cercando gli asset `…_<lingua>.msi`, `…_<lingua>-setup.exe` e `…_<lingua>-portable.exe` prodotti dal workflow `build-windows.yml`;
3. la pagina delle Release su GitHub.
