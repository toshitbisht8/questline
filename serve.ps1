# Serves this folder at http://localhost:5173 using only what ships with Windows.
$port = 5173
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.woff2' = 'font/woff2'; '.md' = 'text/plain; charset=utf-8'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "Could not start on port $port. Is Questline already running in another window?" -ForegroundColor Red
  exit 1
}
Write-Host "Questline is running at http://localhost:$port/"
Write-Host "Keep this window open. Press Ctrl+C or close it to stop."
Start-Process "http://localhost:$port/"
$rootFull = [System.IO.Path]::GetFullPath($root)
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
      if ($path.StartsWith($rootFull) -and (Test-Path $path -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    } catch { $res.StatusCode = 500 }
    $res.Close()
  }
} finally { $listener.Stop() }
