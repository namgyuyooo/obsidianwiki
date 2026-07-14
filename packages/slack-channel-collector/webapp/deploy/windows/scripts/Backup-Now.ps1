$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose --env-file server.env exec backup python3 scripts/backup_db.py backup
Get-ChildItem backups\*.fernet | Sort-Object LastWriteTime -Descending | Select-Object -First 5
