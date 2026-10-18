---
bump: patch
---
The backend Docker image now ships the irisctl operations CLI alongside the server, so migrations, seeding and backups can run inside the container (docker compose -f docker-compose.prod.yml run --rm --entrypoint irisctl backend …) without a separately built binary.
