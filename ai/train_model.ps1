$ErrorActionPreference = "Stop"

$pythonCandidates = @(
    (Join-Path $PSScriptRoot "train-env\Scripts\python.exe"),
    (Join-Path $PSScriptRoot "win-env\Scripts\python.exe")
)
$pythonExe = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$datasetPath = Join-Path $PSScriptRoot "datasets"

if (-not $pythonExe) {
    throw "AI environment is missing. Run: powershell -ExecutionPolicy Bypass -File ai\setup_windows_ai.ps1"
}

if (-not (Test-Path -LiteralPath $datasetPath)) {
    throw "Dataset folder is missing: $datasetPath"
}

& $pythonExe (Join-Path $PSScriptRoot "train_waste_classifier.py") --data $datasetPath --epochs 20
