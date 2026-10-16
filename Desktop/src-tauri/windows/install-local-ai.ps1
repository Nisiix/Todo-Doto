<#
  Todo Doto - installazione facoltativa dell'IA locale (Windows).

  La esegue l'installer solo se l'utente spunta "Installa anche l'IA locale"
  (casella non spuntata di default). Scarica e installa Ollama (gratuito, per
  l'utente corrente) se non c'e' gia', poi gli fa scaricare i modelli. Serve la
  connessione solo adesso: dopo, l'IA funziona tutta sul PC e Todo Doto parla
  solo con Ollama su 127.0.0.1.

  Codici d'uscita: 0 = tutto pronto; 1 = non riuscito (l'app resta installata e
  l'IA si puo' configurare poi da Impostazioni > IA locale).

  -ForApp: lo usa l'app (Impostazioni > IA locale) quando Ollama manca. Installa
  e avvia solo Ollama (i modelli li scarica poi l'app, con l'avanzamento) e
  scrive righe per l'app: "##step <passo>", "##progress <fatti> <totale>",
  "##ready", "##error <messaggio>".
#>
param(
  [string]$Model = 'qwen3:4b',
  [string]$EmbedModel = 'nomic-embed-text',
  [switch]$ForApp
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Server = 'http://127.0.0.1:11434'

function Step([string]$Name) {
  if ($ForApp) { Write-Output "##step $Name" }
}

# Download con l'avanzamento (per l'app): a blocchi, una riga ogni punto percentuale
function Get-File([string]$Uri, [string]$OutFile) {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromMinutes(90)
  try {
    $resp = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) { throw "Download non riuscito (HTTP $([int]$resp.StatusCode))" }
    $total = $resp.Content.Headers.ContentLength
    $in = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $out = [System.IO.File]::Create($OutFile)
    try {
      $buf = New-Object byte[] 1048576
      $done = [long]0
      $last = -1
      while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
        $out.Write($buf, 0, $n)
        $done += $n
        if ($ForApp -and $total) {
          $pct = [int][Math]::Floor(100 * $done / $total)
          if ($pct -ne $last) { Write-Output "##progress $done $total"; $last = $pct }
        }
      }
    } finally {
      $out.Dispose()
      $in.Dispose()
    }
  } finally {
    $client.Dispose()
  }
}

function Find-Ollama {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
    (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Test-Server {
  try { Invoke-RestMethod -Uri "$Server/api/version" -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

function Wait-Server([int]$Seconds) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Server) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

try {
  Step 'check'
  $exe = Find-Ollama
  if (-not $exe) {
    Write-Output 'Ollama: download del programma di installazione...'
    Step 'download'
    $setup = Join-Path $env:TEMP ("OllamaSetup-{0}.exe" -f [guid]::NewGuid().ToString('N'))
    Get-File 'https://ollama.com/download/OllamaSetup.exe' $setup
    # Si esegue solo un installer firmato da Ollama
    Step 'verify'
    $sig = Get-AuthenticodeSignature -FilePath $setup
    if ($sig.Status -ne 'Valid' -or -not $sig.SignerCertificate -or $sig.SignerCertificate.Subject -notmatch 'Ollama') {
      Remove-Item $setup -Force -ErrorAction SilentlyContinue
      throw "Firma dell'installer di Ollama non valida"
    }
    Write-Output 'Ollama: installazione...'
    Step 'install'
    $p = Start-Process -FilePath $setup -ArgumentList '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/SP-' -Wait -PassThru
    Remove-Item $setup -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) { throw "Installazione di Ollama non riuscita (codice $($p.ExitCode))" }
    $exe = Find-Ollama
    if (-not $exe) { throw 'Ollama non trovato dopo l''installazione' }
  } else {
    Write-Output "Ollama gia' installato: $exe"
  }

  if (-not (Test-Server)) {
    Write-Output 'Ollama: avvio...'
    Step 'start'
    Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden
    if (-not (Wait-Server 60)) { throw 'Ollama non risponde su 127.0.0.1:11434' }
  }
  if ($ForApp) {
    Write-Output '##ready'
    exit 0
  }

  foreach ($m in @($Model, $EmbedModel)) {
    if (-not $m) { continue }
    Write-Output "Modello $($m): download (puo' richiedere diversi minuti)..."
    $body = @{ model = $m; stream = $false } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Server/api/pull" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 7200
    if ($r.status -ne 'success') { throw "Download del modello $m non riuscito" }
    Write-Output "Modello $($m): pronto"
  }
  exit 0
} catch {
  Write-Output ("IA locale non installata: " + $_.Exception.Message)
  if ($ForApp) { Write-Output ("##error " + $_.Exception.Message) }
  exit 1
}
