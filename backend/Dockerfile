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

RUN apk add --no-cache ca-certificates \
    && adduser -D -u 65532 nonroot \
    && mkdir -p /data \
    && chown nonroot:nonroot /data

# Copy only the compiled binary from the build stage.
COPY --from=build /out/iris-api /usr/local/bin/iris-api

# The SQLite database lives under /data, which is backed by a named volume so
# it survives container recreation (see docker-compose.yml).
ENV IRIS_API_ADDR=":8080" \
    DATABASE_PATH="/data/iris.db"

USER nonroot

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/iris-api"]
