# Deploying Iris to Hetzner (alongside gamgee)

This deploys Iris on the **same** Hetzner VPS that already runs gamgee, using
the same pattern (host-level Caddy for TLS, a loopback-only compose stack), so
the two apps coexist without interfering. gamgee stays completely untouched.

If you have not deployed gamgee, read `gamgee/docs/deployment.md` first; this
guide assumes that server already exists and is working.

---

## How the two apps share one server

```
                          Browser
                             |  HTTPS (443)
                             v
                          Caddy (on the host, one instance)
                   /                          \
   gamgee.com  ->  localhost:3000        iris-application.com  ->  localhost:3001
        |                                       |
   gamgee stack (Postgres)              iris stack (SQLite)
   /opt/gamgee                          /opt/iris
```

One Caddy instance on the host serves both domains. Each app is a separate
Docker Compose project in its own directory, publishing to a different
loopback port. Nothing about gamgee changes: you only **add** an Iris block to
Caddy and start a second stack.

**The three things that keep them isolated:**

| Concern | gamgee | Iris | Result |
| --- | --- | --- | --- |
| Loopback port | `127.0.0.1:3000` | `127.0.0.1:3001` | no port clash |
| Deploy dir / compose project | `/opt/gamgee` | `/opt/iris` | separate containers + volumes |
| Caddy block | `gamgee.com { ... }` | `iris-application.com { ... }` | one appended block, gamgee's left as-is |

Iris containers are named `iris-backend-1` and `iris-frontend-1`; its database
volume is `iris_iris_sqlite_data`. None of these collide with gamgee's.

**How Iris differs from gamgee internally:** Iris is a Go API with an embedded
**SQLite** database, not Python + Postgres. So the stack is only two services
(a Go backend and an nginx frontend), and the database is a file in a named
volume rather than a separate container. There is no DB port and no DB tunnel.

---

## 1. Buy the domain and point DNS at the server

You already have the Hetzner server (it runs gamgee), so you only need the new
domain and a DNS record pointing at the **same** server IP.

1. Register the domain (Cloudflare Registrar, Porkbun, or Namecheap).
2. In the DNS dashboard, create A records pointing at the existing server IP
   (the same IP gamgee uses):

   | Name | Type | Value |
   | --- | --- | --- |
   | `@` | A | `YOUR_SERVER_IP` |
   | `www` | A | `YOUR_SERVER_IP` |

Wait for DNS to propagate (minutes on Cloudflare, up to 48 h elsewhere) before
step 4, since Caddy needs the domain to resolve to the server to get a
certificate.

> No new firewall rules are needed: ports 80 and 443 are already open from the
> gamgee setup, and Iris does not publish anything else to the host.

---

## 2. Clone Iris into its own directory

SSH into the same server:

```bash
ssh root@YOUR_SERVER_IP
```

Clone Iris next to gamgee, into `/opt/iris`:

```bash
git clone https://github.com/YOUR_USER/iris /opt/iris
cd /opt/iris
```

Docker and Caddy are already installed from the gamgee deploy, so there is
nothing else to install.

---

## 3. Configure secrets

```bash
cd /opt/iris
cp .env.prod.example .env
nano .env
```

Set a strong session secret (the backend refuses to start without it):

```bash
openssl rand -hex 32   # paste the output as IRIS_SESSION_SECRET
```

Minimal `.env`:

```env
IRIS_ENV=production
IRIS_SESSION_SECRET=<the openssl output>
```

The `.env` file is gitignored and stays only on the server.

---

## 4. Add the Iris block to Caddy (do not overwrite gamgee's)

The server has a single `/etc/caddy/Caddyfile` that already contains gamgee's
block. **Append** Iris's block to it; do not replace the file.

```bash
# Append Iris's vhost (already set to iris-application.com)
cat /opt/iris/Caddyfile >> /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile   # confirm the domain if you ever change it
```

After editing, `/etc/caddy/Caddyfile` should contain both blocks, for example:

```
gamgee.com {
    reverse_proxy localhost:3000
}

iris-application.com {
    reverse_proxy localhost:3001
}
```

Validate and reload Caddy without downtime (this does not affect gamgee):

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

---

## 5. Build and start the Iris stack

```bash
cd /opt/iris
docker compose -f docker-compose.prod.yml up --build -d
```

- `--build` builds the Go backend and the frontend images from source (needed
  on first deploy and after code changes).
- `-d` runs detached.
- Only `127.0.0.1:3001` is published, so the stack is reachable only through
  Caddy, never directly from the internet.

Iris is now live at `https://iris-application.com`. Caddy provisions the TLS certificate on
the first request (within a few seconds).

Verify the stack is healthy:

```bash
docker compose -f docker-compose.prod.yml ps       # both services "Up", backend "healthy"
curl -sS https://iris-application.com/api/healthz               # backend reachable through Caddy
```

---

## 6. (Optional) Automatic deploys via GitHub Actions

`.github/workflows/deploy.yml` redeploys Iris on every push to `main` by SSHing
in, pulling, and rebuilding, exactly like gamgee. Set these repository secrets
under **GitHub -> repo -> Settings -> Secrets and variables -> Actions**:

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname (same server as gamgee) |
| `HETZNER_USER` | SSH user (usually `root`) |
| `HETZNER_SSH_KEY` | Private key whose public half is on the server |
| `HETZNER_PORT` | SSH port (optional, defaults to 22) |
| `DEPLOY_PATH` | `/opt/iris` |

If you prefer manual deploys, skip this and use `make deploy` (see below).

---

## Updating after code changes

Manually on the server:

```bash
cd /opt/iris
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Or from your laptop, using the `Makefile` (set `HETZNER_HOST` / `HETZNER_USER`
in your shell profile first):

```bash
make deploy     # git pull + rebuild on the server
make logs       # tail container logs
make ssh        # shell into the server
```

The SQLite database is untouched by rebuilds: it lives in the
`iris_iris_sqlite_data` named volume, which persists across every recreate.
Only `docker compose -f docker-compose.prod.yml down -v` would delete it.

---

## Seeding or replacing the database

Iris stores everything in a single SQLite file at `/data/iris.db` inside the
backend container, backed by the `iris_iris_sqlite_data` volume. The backend
creates it on first start and runs migrations against whatever it finds, so any
seed file must be produced by this same app version.

To seed from an existing `iris.db` before the first start (or to replace it):

```bash
cd /opt/iris
# 1. Stop the stack if running (keeps the volume)
docker compose -f docker-compose.prod.yml down

# 2. Copy your file into the volume as /data/iris.db. The backend runs as
#    uid 65532, so match ownership.
docker run --rm -v iris_iris_sqlite_data:/data -v "$PWD:/seed" alpine \
  sh -c "cp /seed/iris.db /data/iris.db && chown 65532:65532 /data/iris.db"

# 3. Start again
docker compose -f docker-compose.prod.yml up --build -d
```

To back up the live database to your laptop, use `make db-pull` (writes
`./iris-backup-<timestamp>.db`).

---

## Logs and debugging

```bash
# All Iris container logs
docker compose -f docker-compose.prod.yml logs -f

# One service
docker compose -f docker-compose.prod.yml logs -f backend

# Caddy (shared with gamgee)
journalctl -u caddy -f
```

---

## Rollback

Iris builds from source on the server, so to roll back, check out a known-good
commit and rebuild:

```bash
cd /opt/iris
git checkout <known-good-sha>
docker compose -f docker-compose.prod.yml up --build -d
```

Return to automatic updates by checking out `main` again and pushing (or
`make deploy`).

---

## Rollback safety note on Caddy

If you ever need to remove Iris, delete only its block from
`/etc/caddy/Caddyfile`, then `systemctl reload caddy` and
`docker compose -f docker-compose.prod.yml down` in `/opt/iris`. gamgee's block
and stack are independent and stay running throughout.
