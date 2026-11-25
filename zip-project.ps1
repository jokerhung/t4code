param(
  # Duong dan file zip dau ra. Mac dinh: <thu muc cha>\<ten project>-<yyyyMMdd-HHmmss>.zip
  [string]$Output
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$name = Split-Path -Leaf $root

if (-not $Output) {
  $Output = Join-Path (Split-Path -Parent $root) ("$name-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$Output = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }

# Thu muc cai dat / build / cache, bo qua o moi do sau. .env duoc giu lai.
$excludeDirs = @(
  'node_modules', 'dist', '.turbo', '.vite', '.next', '.expo', '.cache',
  # 'coverage', 'Pods', '.gradle', 'DerivedData', '.git', '.t3'
  'coverage', 'Pods', '.gradle', 'DerivedData', '.t3'
)
$excludeFiles = @('*.log', '*.zip', '*.tsbuildinfo')

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host '[zip] Dang quet danh sach file...'
$files = [Collections.Generic.List[string]]::new()
$stack = [Collections.Generic.Stack[string]]::new()
$stack.Push($root)
while ($stack.Count -gt 0) {
  $dir = $stack.Pop()
  $hasCargo = Test-Path -LiteralPath (Join-Path $dir 'Cargo.toml')

  foreach ($sub in [IO.Directory]::GetDirectories($dir)) {
    $leaf = Split-Path -Leaf $sub
    if ($excludeDirs -contains $leaf) { continue }
    if ($hasCargo -and $leaf -eq 'target') { continue }
    $stack.Push($sub)
  }

  foreach ($file in [IO.Directory]::GetFiles($dir)) {
    if ($file -eq $Output) { continue }
    $leaf = Split-Path -Leaf $file
    $skip = $false
    foreach ($pattern in $excludeFiles) {
      if ($leaf -like $pattern) { $skip = $true; break }
    }
    if (-not $skip) { $files.Add($file) }
  }
}

$total = $files.Count
Write-Host "[zip] Tong cong $total file. Dang nen..."

$zip = [IO.Compression.ZipFile]::Open($Output, 'Create')
$count = 0
$lastUpdate = [Diagnostics.Stopwatch]::StartNew()
try {
  foreach ($file in $files) {
    $relative = $file.Substring($root.Length).TrimStart('\', '/') -replace '\\', '/'
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $file, "$name/$relative", [IO.Compression.CompressionLevel]::Optimal)
    $count++

    if ($lastUpdate.ElapsedMilliseconds -ge 100 -or $count -eq $total) {
      $percent = [int](100 * $count / $total)
      Write-Progress -Activity "Zip $name" -Status "$count/$total ($percent%) $relative" -PercentComplete $percent
      $lastUpdate.Restart()
    }
  }
}
finally {
  $zip.Dispose()
  Write-Progress -Activity "Zip $name" -Completed
}

$size = '{0:N1} MB' -f ((Get-Item -LiteralPath $Output).Length / 1MB)
Write-Host "[zip] $count files, $size -> $Output"
