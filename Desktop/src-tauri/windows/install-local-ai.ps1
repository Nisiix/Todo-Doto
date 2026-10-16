<#
  Todo Doto - installazione facoltativa dell'IA locale (Windows).

  La esegue l'installer solo se l'utente spunta "Installa anche l'IA locale"
  (casella non spuntata di default). Scarica e installa Ollama (gratuito, per
  l'utente corrente) se non c'e' gia', poi gli fa scaricare i modelli. Serve la
  connessione solo adesso: dopo, l'IA funziona tutta sul PC e Todo Doto parla
  solo con Ollama su 127.0.0.1.

  Codici d'uscita: 0 = tutto pronto; 1 = non riuscito (l'app resta installata e
  l'IA si puo' configurare poi da Impostazioni > IA locale).
#>
param(
  [string]$Model = 'qwen3:4b',
  [string]$EmbedModel = 'nomic-embed-text'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Server = 'http://127.0.0.1:11434'

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
  $exe = Find-Ollama
  if (-not $exe) {
    Write-Output 'Ollama: download del programma di installazione...'
    $setup = Join-Path $env:TEMP ("OllamaSetup-{0}.exe" -f [guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $setup -UseBasicParsing
    # Si esegue solo un installer firmato da Ollama
    $sig = Get-AuthenticodeSignature -FilePath $setup
    if ($sig.Status -ne 'Valid' -or -not $sig.SignerCertificate -or $sig.SignerCertificate.Subject -notmatch 'Ollama') {
      Remove-Item $setup -Force -ErrorAction SilentlyContinue
      throw "Firma dell'installer di Ollama non valida"
    }
    Write-Output 'Ollama: installazione...'
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
    Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden
    if (-not (Wait-Server 60)) { throw 'Ollama non risponde su 127.0.0.1:11434' }
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
  exit 1
}
