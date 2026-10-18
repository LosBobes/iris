# syntax=docker/dockerfile:1
#
# Frontend image for the Iris web UI (apps/web, Vite + React).
#
# Build context is the repository root (see deploy/docker-compose.yml and
# .github/workflows/build.yml), so source paths below are repo-relative.
#
# The built SPA is served by nginx, which also reverse-proxies /api/ to the
# backend so the browser only ever talks to a single origin (port 80).

# --- Build stage ------------------------------------------------------------
FROM node:24-alpine AS build

# Mirror the repo layout so vite.config.ts finds ../../VERSION (the app version).
WORKDIR /src/apps/web

# In the browser the API is reached at the same origin under /api, which nginx
# proxies to the backend. Baking this into the Vite build makes the client send
# requests to /api/... instead of directly to the backend host.
ENV VITE_IRIS_API_BASE_URL="/api"

# Sentry DSN baked into the production bundle from the SENTRY_DSN_FRONTEND
# GitHub Actions secret (see .github/workflows/build.yml). A DSN is a
# client-side ingestion key, not a secret, so embedding it in the bundle is
# expected. Empty by default, which disables Sentry for local/source builds.
# Vite reads VITE_* env vars at build time, so this must be set before the
# build step below.
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_RELEASE=""
ENV VITE_SENTRY_DSN="${VITE_SENTRY_DSN}" \
    VITE_SENTRY_RELEASE="${VITE_SENTRY_RELEASE}"

# Cache npm install on the lockfile layer.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY VERSION /src/VERSION
COPY apps/web/ ./
RUN npm run build

# --- Final stage ------------------------------------------------------------
FROM nginx:1.27-alpine

# Vite emits the production build into dist/.
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# Renders the trusted-proxy (real IP) settings from IRIS_TRUSTED_PROXY at
# container start; the image's entrypoint runs /docker-entrypoint.d/*.sh.
COPY --chmod=0755 frontend/iris-real-ip.sh /docker-entrypoint.d/15-iris-real-ip.sh

EXPOSE 80
