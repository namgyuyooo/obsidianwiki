param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$resolved = Resolve-Path $BackupFile
$name = Split-Path $resolved -Leaf
if (-not (Test-Path "backups\$name")) { Copy-Item $resolved "backups\$name" }
Write-Warning "현재 DB를 $name 백업으로 교체합니다."
$answer = Read-Host "계속하려면 RESTORE 입력"
if ($answer -ne "RESTORE") { throw "복원이 취소되었습니다." }
docker compose --env-file server.env stop caddy app backup
try {
    docker compose --env-file server.env run --rm --no-deps backup `
        python3 scripts/backup_db.py restore "/backups/$name"
} finally {
    docker compose --env-file server.env up -d
}
Write-Host "복원 완료" -ForegroundColor Green
