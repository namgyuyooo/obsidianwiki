$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose --env-file server.env ps
docker compose --env-file server.env logs --tail 80 app
