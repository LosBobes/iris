# syntax=docker/dockerfile:1
#
# Backend image for the Iris Go API (iris-api/cmd/server).
#
# Build context is the repository root (see deploy/docker-compose.yml and
# .github/workflows/build.yml), so source paths below are repo-relative.
#
# The binary is built fully static (CGO_ENABLED=0) because the SQLite driver
# is the pure-Go modernc.org/sqlite, so no libc or shell is required at runtime.

# --- Build stage ------------------------------------------------------------
FROM golang:1.26-alpine AS build

WORKDIR /src

# Cache module downloads on their own layer.
COPY iris-api/go.mod iris-api/go.sum ./
RUN go mod download

COPY iris-api/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/iris-api ./cmd/server

# --- Final stage ------------------------------------------------------------
# alpine (not distroless) so the compose healthcheck can use the bundled
# wget against /healthz. ca-certificates is added for any outbound TLS.
FROM alpine:3.21

# chromium is a runtime dependency, not a nicety: GET /work-orders/{id}/report
# renders the print sheet through headless Chrome (chromedp). Without it the
# endpoint failed in production with
#   chromedp failed to render PDF: exec: "google-chrome": executable file not
#   found in $PATH
# because this image shipped only the Go binary. The font packages are what
# make the sheet render as text rather than tofu boxes: ttf-liberation covers
# Latin, font-noto adds the Serbian Cyrillic/Latin diacritics (Č, Ć, Š, Ž, Đ).
RUN apk add --no-cache \
        ca-certificates \
        chromium \
        freetype \
        harfbuzz \
        nss \
        ttf-liberation \
        font-noto \
    && adduser -D -u 65532 nonroot \
    && mkdir -p /data \
    && chown nonroot:nonroot /data

# Pin the browser behind a stable path. Alpine has shipped the binary as both
# `chromium` and `chromium-browser` across releases, so resolve it here: the
# build fails loudly if the package ever stops providing either name, instead
# of the container starting fine and only failing on the first print.
RUN chrome="$(command -v chromium-browser || command -v chromium)" \
    && test -x "$chrome" \
    && ln -sf "$chrome" /usr/local/bin/iris-chrome

# Copy only the compiled binary from the build stage.
COPY --from=build /out/iris-api /usr/local/bin/iris-api

# Sentry DSN baked in at build time from the SENTRY_DSN GitHub Actions secret
# (see .github/workflows/build.yml). A DSN is an ingestion key, not a secret,
# so embedding it in the image is fine; runtime env can still override it, and
# leaving it empty disables Sentry. Empty by default for local/source builds.
ARG SENTRY_DSN=""

# The SQLite database lives under /data, which is backed by a named volume so
# it survives container recreation (see docker-compose.yml).
ENV IRIS_API_ADDR=":8080" \
    DATABASE_PATH="/data/iris.db" \
    SENTRY_DSN="${SENTRY_DSN}" \
    IRIS_CHROME_PATH="/usr/local/bin/iris-chrome"

USER nonroot

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/iris-api"]
