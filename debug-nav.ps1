# PowerShell script to debug NAV trends - works from any directory
# Usage: .\debug-nav.ps1 UTG
# Or: .\debug-nav.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$Ticker = ""
)

# Get the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if we're in the root or server directory
if (Test-Path "$scriptPath\server\scripts\debug_nav_trend.ts") {
    $serverDir = "$scriptPath\server"
} elseif (Test-Path "$scriptPath\scripts\debug_nav_trend.ts") {
    $serverDir = $scriptPath
} else {
    Write-Host "Error: Could not find debug_nav_trend.ts script"
    Write-Host "Please run this from the project root or server directory"
    exit 1
}

# Change to server directory
Push-Location $serverDir

try {
    if ($Ticker -eq "") {
        Write-Host "Usage: .\debug-nav.ps1 <TICKER>"
        Write-Host "Example: .\debug-nav.ps1 UTG"
        exit 1
    }
    
    Write-Host "Running NAV trend debug for: $Ticker"
    Write-Host "Working directory: $serverDir`n"
    
    npx tsx scripts/debug_nav_trend.ts $Ticker
} finally {
    Pop-Location
}

