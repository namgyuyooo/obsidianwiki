param(
    [string]$ServerIP = ""
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop이 설치되어 있지 않습니다. Linux containers 모드로 설치한 뒤 다시 실행하세요."
}
docker info | Out-Null

if (-not $ServerIP) {
    $ServerIP = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
        Select-Object -First 1 -ExpandProperty IPAddress
}
if (-not $ServerIP) { throw "사내 LAN IPv4 주소를 찾지 못했습니다. -ServerIP로 지정하세요." }

New-Item -ItemType Directory -Force data, backups, secrets, certs | Out-Null
if (-not (Test-Path "data\rtm_customer.db")) {
    throw "data\rtm_customer.db가 없습니다. DB가 포함된 배포 번들을 사용하세요."
}

if (-not (Test-Path "secrets\rtm_secret_key")) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $key = [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_')
    [IO.File]::WriteAllText((Join-Path (Get-Location) "secrets\rtm_secret_key"), $key, (New-Object Text.UTF8Encoding($false)))
}

# 비밀 키는 현재 관리자와 SYSTEM만 읽을 수 있게 제한한다.
icacls "secrets" /inheritance:r | Out-Null
icacls "secrets" /grant:r "${env:USERNAME}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null

@("RTM_BIND_IP=$ServerIP", "RTM_HOST=https://$ServerIP") |
    Set-Content -Encoding ascii "server.env"

docker compose --env-file server.env config --quiet
docker compose --env-file server.env build
if (-not (Test-Path "secrets\.admin_initialized")) {
    $credentials = docker compose --env-file server.env run --rm --no-deps app python3 scripts/bootstrap_admin.py
    $credentials | Set-Content -Encoding utf8 "secrets\INITIAL_ADMIN.txt"
    New-Item -ItemType File "secrets\.admin_initialized" | Out-Null
    Write-Host "새 관리자 자격증명: secrets\INITIAL_ADMIN.txt" -ForegroundColor Yellow
}
docker compose --env-file server.env up -d

if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Get-NetFirewallRule -DisplayName "RTM Customer DB HTTPS" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName "RTM Customer DB HTTPS" -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort 443 -LocalAddress $ServerIP -RemoteAddress LocalSubnet -Profile Private | Out-Null
} else {
    Write-Warning "관리자 PowerShell이 아니어서 Windows 방화벽 규칙을 만들지 못했습니다. 관리자 권한으로 다시 실행하세요."
}

Start-Sleep -Seconds 8
docker compose --env-file server.env cp caddy:/data/caddy/pki/authorities/local/root.crt certs/rtm-local-root.crt
Write-Host ""
Write-Host "RTM 서버 설치 완료: https://$ServerIP" -ForegroundColor Green
Write-Host "각 접속 PC에 certs\rtm-local-root.crt를 '신뢰할 수 있는 루트 인증 기관'으로 설치하세요."
Write-Host "토큰은 웹 관리자 패널에서 입력하며 이 폴더의 env 파일에는 저장되지 않습니다."
Write-Host "첫 로그인 후 secrets\INITIAL_ADMIN.txt를 안전하게 삭제하세요."
