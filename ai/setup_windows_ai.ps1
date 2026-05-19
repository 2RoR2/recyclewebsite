$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$venvPath = Join-Path $PSScriptRoot "win-env"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

function Test-WindowsPython {
    param(
        [string]$Executable,
        [string[]]$Arguments = @()
    )

    try {
        $output = & $Executable @Arguments -c "import sys, sysconfig; print(sys.executable); print(sys.version); print(sysconfig.get_platform())"
    } catch {
        return $false
    }

    if (-not $output -or $output.Count -lt 3) {
        return $false
    }

    $exe = [string]$output[0]
    $version = [string]$output[1]
    $platform = [string]$output[2]

    return $exe -notmatch "msys|mingw|mysql|postgres|pgAdmin" -and
        $version -match "3\.(11|12)" -and
        $platform -match "win-amd64"
}

function New-AiEnvironment {
    param(
        [string]$Executable,
        [string[]]$Arguments = @()
    )

    if (Test-Path -LiteralPath $venvPath) {
        $resolved = Resolve-Path -LiteralPath $venvPath
        if (-not $resolved.Path.StartsWith($projectRoot.Path)) {
            throw "Refusing to remove path outside project: $resolved"
        }
        Remove-Item -LiteralPath $resolved.Path -Recurse -Force
    }

    & $Executable @Arguments -m venv $venvPath

    if (-not (Test-Path -LiteralPath $pythonExe)) {
        throw "Virtual environment was not created correctly. Install Python 3.11 from python.org and rerun this script."
    }

    & $pythonExe -m pip install --upgrade pip setuptools wheel
    & $pythonExe -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
    & $pythonExe -c "import tensorflow as tf; print(tf.__version__)"
}

$candidates = @(
    @{ Name = "py -3.11"; Executable = "py"; Arguments = @("-3.11") },
    @{ Name = "py -3.12"; Executable = "py"; Arguments = @("-3.12") },
    @{ Name = "python"; Executable = "python"; Arguments = @() }
)

foreach ($candidate in $candidates) {
    if (Test-WindowsPython $candidate.Executable $candidate.Arguments) {
        Write-Host "Using $($candidate.Name)"
        New-AiEnvironment $candidate.Executable $candidate.Arguments
        Write-Host "AI environment ready: $pythonExe"
        exit 0
    }
}

throw "No suitable Windows CPython 3.11/3.12 was found. Install Python 3.11 from https://www.python.org/downloads/windows/ and tick 'Add python.exe to PATH', then rerun: powershell -ExecutionPolicy Bypass -File ai\setup_windows_ai.ps1"
