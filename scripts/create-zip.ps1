Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourceDir = "C:\projects\REDTAG"
$desktop1 = [Environment]::GetFolderPath('Desktop')
$desktop2 = "C:\Users\yochi\Desktop"
$projectsDir = "C:\projects"

$targetPaths = @()
if (Test-Path $desktop1) {
    $targetPaths += Join-Path $desktop1 "REDTAG.zip"
}
if ((Test-Path $desktop2) -and ($desktop2 -ne $desktop1)) {
    $targetPaths += Join-Path $desktop2 "REDTAG.zip"
}
if (Test-Path $projectsDir) {
    $targetPaths += Join-Path $projectsDir "REDTAG.zip"
}

Write-Host "Target paths for REDTAG.zip:"
foreach ($t in $targetPaths) {
    Write-Host " - $t"
    if (Test-Path $t) {
        Remove-Item -Path $t -Force -ErrorAction SilentlyContinue
    }
}

$tempZip = Join-Path ([System.IO.Path]::GetTempPath()) ("REDTAG_" + [System.Guid]::NewGuid().ToString() + ".zip")

$excludePatterns = @(
    '\\node_modules(\\.*)?$',
    '\\\.git(\\.*)?$',
    '\\uploads(\\.*)?$',
    '\\backend\\uploads(\\.*)?$',
    '\\frontend\\dist(\\.*)?$',
    '\\java-service\\bin(\\.*)?$',
    '\\backend\\data\\.*\.db.*$',
    '\.sqlite$',
    '\.log$',
    '\.DS_Store$',
    '\\datetime$'
)

$zipArchive = [System.IO.Compression.ZipFile]::Open($tempZip, [System.IO.Compression.ZipArchiveMode]::Create)

$allFiles = Get-ChildItem -Path $sourceDir -Recurse -File -Force
$dirsAdded = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$fileCount = 0

foreach ($file in $allFiles) {
    $relPath = $file.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
    
    $skip = $false
    foreach ($pat in $excludePatterns) {
        if ($file.FullName -match $pat) {
            $skip = $true
            break
        }
    }
    if ($skip) { continue }

    # Ensure parent directory entries exist in zip
    $parts = $relPath.Split([char[]]@('\', '/'))
    if ($parts.Length -gt 1) {
        $curDir = ""
        for ($i = 0; $i -lt ($parts.Length - 1); $i++) {
            $curDir += $parts[$i] + "/"
            if ($dirsAdded.Add($curDir)) {
                $null = $zipArchive.CreateEntry($curDir)
            }
        }
    }

    try {
        $entryName = $relPath.Replace('\', '/')
        $entry = $zipArchive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $fileStream.CopyTo($entryStream)
        $fileStream.Dispose()
        $entryStream.Dispose()
        $fileCount++
    } catch {
        Write-Warning "Skipped file due to lock: $($file.FullName) - $($_.Exception.Message)"
    }
}

$zipArchive.Dispose()

Write-Host "Packaged $fileCount files cleanly into zip."

foreach ($t in $targetPaths) {
    Copy-Item -Path $tempZip -Destination $t -Force
    $fi = Get-Item $t
    Write-Host "Created: $($fi.FullName) (Size: $($fi.Length) bytes, LastWrite: $($fi.LastWriteTime))"
}

Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
Write-Host "SUCCESS: REDTAG.zip updated cleanly across all target locations!"
