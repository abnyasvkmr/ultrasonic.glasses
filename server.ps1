# server.ps1 - Robust TCP-based HTTP server (Supports any Host header & public tunnels)
$port = 5173
$root = $PSScriptRoot

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)

try {
    $listener.Start()
    Write-Output "Ultrasonic Glasses Server listening on port $port"
} catch {
    Write-Error "Failed to start listener on port ${port}: $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".mp4"  = "video/mp4"
}

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        # Read remaining headers
        while ($true) {
            $headerLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($headerLine)) { break }
        }

        $parts = $requestLine.Split(' ')
        if ($parts.Length -lt 2) {
            $client.Close()
            continue
        }

        $rawUrl = $parts[1].Split('?')[0].Split('#')[0]
        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        $filePath = [System.IO.Path]::Combine($root, $rawUrl.TrimStart('/'))
        $filePath = [System.IO.Path]::GetFullPath($filePath)

        if ($filePath.StartsWith($root) -and [System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)

            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
        } else {
            $errMsg = "404 Not Found"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errMsg)
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($errBytes.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)

            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($errBytes, 0, $errBytes.Length)
            $stream.Flush()
        }

        $client.Close()
    } catch {
        # ignore client disconnects
    }
}
