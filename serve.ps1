param(
  [int] $Port = 4173
)

$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "ATC server: $prefix"
Write-Host "Root: $root"

function Get-ContentType([string] $fullPath) {
  $ext = [IO.Path]::GetExtension($fullPath).ToLowerInvariant()
  switch ($ext) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".svg" { return "image/svg+xml" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    default { return "application/octet-stream" }
  }
}

try {
  while ($true) {
    try {
      $context = $listener.GetContext()
    } catch {
      Write-Host ("GetContext error: " + $_.Exception.Message)
      Start-Sleep -Seconds 1
      continue
    }
    $req = $context.Request
    $res = $context.Response

    $rel = $req.Url.LocalPath.TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $rel = $rel -replace "/", [IO.Path]::DirectorySeparatorChar

    $candidate = Join-Path $root $rel
    try { $full = [IO.Path]::GetFullPath($candidate) } catch { $full = $null }

    if (-not $full -or -not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
      $res.ContentType = "text/plain; charset=utf-8"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    try {
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.StatusCode = 200
      $res.ContentType = (Get-ContentType $full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $res.StatusCode = 500
      $bytes = [Text.Encoding]::UTF8.GetBytes("Server error")
      $res.ContentType = "text/plain; charset=utf-8"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
      $res.Close()
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  try { $listener.Close() } catch {}
}
