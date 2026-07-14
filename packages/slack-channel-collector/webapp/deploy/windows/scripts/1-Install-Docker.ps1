$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$installer = Join-Path (Get-Location) "installers\Docker Desktop Installer.exe"
if (-not (Test-Path $installer)) {
    throw "Docker Desktop 설치 파일이 없습니다: $installer"
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "WSL2 기능을 활성화합니다. Windows 재시작이 필요할 수 있습니다." -ForegroundColor Yellow
    wsl.exe --install --no-distribution
}

Write-Host "Docker Desktop을 WSL2/Linux containers 모드로 설치합니다."
Start-Process $installer -Wait -ArgumentList "install", "--user", "--backend=wsl-2", "--no-windows-containers"
Write-Host ""
Write-Host "Docker Desktop 설치 완료." -ForegroundColor Green
Write-Host "Windows를 재시작하고 Docker Desktop을 한 번 실행한 뒤 Install-RTM.ps1을 실행하세요."
