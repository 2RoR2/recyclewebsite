param(
    [int]$MinImagesPerClass = 20,
    [int]$CheckEveryMinutes = 30,
    [switch]$Watch
)

$ErrorActionPreference = "Stop"

$imageExtensions = @(".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp")
$datasetPath = Join-Path $PSScriptRoot "datasets"
$stampPath = Join-Path $PSScriptRoot "models\last_retrain.json"
$requiredClasses = @("paper", "plastic", "aluminium", "general_waste")

function Get-DatasetCounts {
    $counts = @{}
    foreach ($className in $requiredClasses) {
        $classPath = Join-Path $datasetPath $className
        if (-not (Test-Path -LiteralPath $classPath)) {
            $counts[$className] = 0
            continue
        }

        $counts[$className] = @(Get-ChildItem -LiteralPath $classPath -Recurse -File |
            Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() }).Count
    }
    return $counts
}

function Get-DatasetFingerprint($counts) {
    return ($requiredClasses | ForEach-Object { "$_=$($counts[$_])" }) -join ";"
}

function Get-LastFingerprint {
    if (-not (Test-Path -LiteralPath $stampPath)) {
        return ""
    }

    try {
        return (Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json).fingerprint
    } catch {
        return ""
    }
}

function Save-RetrainStamp($fingerprint, $counts) {
    $stampDir = Split-Path -Parent $stampPath
    New-Item -ItemType Directory -Force -Path $stampDir | Out-Null
    [pscustomobject]@{
        retrainedAt = (Get-Date).ToString("o")
        fingerprint = $fingerprint
        counts = $counts
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $stampPath -Encoding UTF8
}

function Invoke-AutoRetrain {
    $counts = Get-DatasetCounts
    $ready = $true

    foreach ($className in $requiredClasses) {
        if ($counts[$className] -lt $MinImagesPerClass) {
            $ready = $false
        }
    }

    $countLabel = ($requiredClasses | ForEach-Object { "$_=$($counts[$_])" }) -join ", "
    Write-Host "Dataset counts: $countLabel"

    if (-not $ready) {
        Write-Host "Not enough samples yet. Need at least $MinImagesPerClass images per class."
        return
    }

    $fingerprint = Get-DatasetFingerprint $counts
    if ($fingerprint -eq (Get-LastFingerprint)) {
        Write-Host "Dataset has not changed since the last retrain."
        return
    }

    Write-Host "Retraining EcoCycle waste classifier..."
    & (Join-Path $PSScriptRoot "train_model.ps1")
    Save-RetrainStamp $fingerprint $counts
    Write-Host "Retraining complete."
}

do {
    Invoke-AutoRetrain
    if ($Watch) {
        Start-Sleep -Seconds ($CheckEveryMinutes * 60)
    }
} while ($Watch)
