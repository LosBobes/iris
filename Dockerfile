# syntax=docker/dockerfile:1

FROM golang:1.26-bookworm AS build

WORKDIR /src/iris-api

COPY iris-api/go.mod iris-api/go.sum ./
RUN go mod download

COPY iris-api/ ./
RUN mkdir -p /out /empty-data && \
	CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/iris-api ./cmd/server && \
	CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/irisctl ./cmd/irisctl

FROM node:24-bookworm-slim AS web-build

WORKDIR /src/apps/web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
RUN npm run build

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
	chromium \
	ca-certificates \
	fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*

RUN groupadd -g 65532 nonroot && \
	useradd -r -u 65532 -g nonroot nonroot && \
	mkdir -p /app /data && \
	chown -R 65532:65532 /app /data

WORKDIR /app

COPY --from=build --chown=65532:65532 /out/iris-api /usr/local/bin/iris-api
COPY --from=build --chown=65532:65532 /out/irisctl /usr/local/bin/irisctl
COPY --from=build --chown=65532:65532 /empty-data /data
COPY --chown=65532:65532 iris-api/testdata ./testdata
COPY --from=web-build --chown=65532:65532 /src/apps/web/dist ./web

ENV IRIS_API_ADDR=:8080
ENV DATABASE_PATH=/data/iris.db
ENV IRIS_WEB_DIR=/app/web

EXPOSE 8080

USER 65532:65532

ENTRYPOINT ["/usr/local/bin/iris-api"]
