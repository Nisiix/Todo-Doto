# Video tutorial del sito

I video della sezione «Video tutorial» della landing (`Web/index.html#tutorial`) sono fatti con [HyperFrames](https://hyperframes.heygen.com) (HeyGen, Apache 2.0): ogni video è una composizione HTML con una timeline GSAP, renderizzata in MP4 sul PC, senza servizi esterni.

| File | Cosa contiene |
|---|---|
| `tutorials.json` | i tre tutorial: titoli, passi, testi in italiano e in inglese; per ogni passo il fotogramma dell'app e, se serve, la zona da inquadrare (`box`) |
| `frames/<lingua>/` | fotogrammi dell'app (1600×1000) e `boxes.json` con le zone dei controlli, prodotti da `Desktop/scripts/screenshots.mjs` insieme alle schermate del sito |
| `build.mjs` | genera i progetti HyperFrames in `build/<lingua>/<id>/` e, con `--render`, li verifica (`hyperframes check`) e li esporta in `Web/assets/video/<lingua>/<id>.mp4` con l'anteprima `<id>.jpg` |

## Aggiornare i video

```bash
cd Video
npm install
npm run frames            # rifà schermate del sito e fotogrammi (serve Desktop/node_modules)
node build.mjs            # solo i progetti: per vederli, cd build/it/getting-started && npx hyperframes preview
node build.mjs --render   # tutti i video (circa 2 minuti ciascuno)
node build.mjs --render en stack-and-setup   # una lingua e/o un tutorial
```

Requisiti: Node 22+, FFmpeg e Chrome. Se `npx hyperframes browser ensure` non può scaricarlo, indicare un Chrome/Chromium già installato con `HYPERFRAMES_BROWSER_PATH`.

Struttura di ogni video: apertura con il logo (2,8 s), un passo ogni 5,4 s (la finestra dell'app entra, si avvicina alla zona indicata, che viene evidenziata, con la didascalia sotto), chiusura con l'invito a scaricare (3,2 s). I video sono senza audio: i testi sono nelle didascalie. Per cambiare un testo basta `tutorials.json` e un nuovo `--render`.
