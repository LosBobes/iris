# Shorthand for the Hetzner deploy. Mirrors gamgee's Makefile.
#
# Set HETZNER_HOST / HETZNER_USER in your shell profile (same names as the
# GitHub Actions secrets) or pass them on the command line:
#   export HETZNER_HOST=1.2.3.4   HETZNER_USER=root
#   make ssh HETZNER_HOST=1.2.3.4 HETZNER_USER=root
HETZNER_USER ?= root
HOST         ?= $(HETZNER_USER)@$(HETZNER_HOST)
DEPLOY_PATH  ?= /opt/iris

.PHONY: ssh logs deploy db-pull

# SSH into the server.
ssh:
	ssh $(HOST)

# Tail the running container logs.
logs:
	ssh $(HOST) "cd $(DEPLOY_PATH) && docker compose -f docker-compose.prod.yml logs -f"

# Manual deploy (the GitHub Action does this automatically on push to main).
deploy:
	ssh $(HOST) "cd $(DEPLOY_PATH) && git fetch origin main && git reset --hard origin/main && docker compose -f docker-compose.prod.yml up --build -d --remove-orphans && docker image prune -f"

# Back up the live SQLite database to ./iris-backup-<date>.db locally.
db-pull:
	@f=iris-backup-$$(date +%Y%m%d-%H%M%S).db; \
	echo "Copying /data/iris.db from the backend container to ./$$f"; \
	ssh $(HOST) "docker cp iris-backend-1:/data/iris.db /tmp/iris-pull.db" && \
	scp $(HOST):/tmp/iris-pull.db ./$$f && \
	ssh $(HOST) "rm -f /tmp/iris-pull.db" && \
	echo "Saved ./$$f"
