---
bump: patch
---
Deploy workflow now prunes superseded iris image tags, not just dangling layers. Each release is a tagged git-<sha> image (~1.1GB backend), and docker image prune -f only removes untagged images, so old releases accumulated until the shared host's disk filled and the site went down with a SQLite disk I/O error. The deploy now also removes old iris-backend/iris-frontend tags, keeping the deployed release and latest (older builds re-pull from GHCR for rollback).
