# Tiny static file server for local development.
#
# The game uses ES modules, which browsers refuse to load over file:// — open
# index.html directly and you get a permanent "Loading the frozen world…".
# This serves the folder over HTTP instead. No Python or Node needed.
#
#   Right-click this file -> "Run with PowerShell"
#   ...or from a terminal in this folder:
#
#       powershell -ExecutionPolicy Bypass -File serve.ps1
#
# Then open  http://127.0.0.1:8080
# Press Ctrl+C in the window to stop it.

param(
  [int]$Port = 8080,
  [string]$Root = (Join-Path $PSScriptRoot 'game')
)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.webp' = 'image/webp'
  '.svg'  = 'image/svg+xml'
  '.json' = 'application/json'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
  '.wav'  = 'audio/wav'
  '.woff2'= 'font/woff2'
}

if (-not (Test-Path -LiteralPath $Root)) {
  Write-Host "Could not find the game folder at: $Root" -ForegroundColor Red
  exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on port $Port. Something else may be using it." -ForegroundColor Red
  Write-Host "Try a different one:  powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8090" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  Ice Age Mammoth Runner" -ForegroundColor Cyan
Write-Host "  serving $Root"
Write-Host ""
Write-Host "  ->  http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "  Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($rel -eq '/') { $rel = '/index.html' }

      # keep requests inside $Root
      $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($rel.TrimStart('/') -replace '/', '\')))
      $rootFull = [System.IO.Path]::GetFullPath($Root)

      if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
      }
      elseif (Test-Path -LiteralPath $full -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $res.ContentType = $ct
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host ("  200  " + $rel) -ForegroundColor DarkGray
      }
      else {
        $res.StatusCode = 404
        Write-Host ("  404  " + $rel) -ForegroundColor DarkYellow
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
