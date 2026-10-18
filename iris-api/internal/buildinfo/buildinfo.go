// Package buildinfo carries the version the binaries were built as.
//
// Release images set both values at link time (backend/Dockerfile):
//
//	go build -ldflags "-X github.com/LosBobes/iris/iris-api/internal/buildinfo.Version=2.3.0 \
//	    -X github.com/LosBobes/iris/iris-api/internal/buildinfo.Commit=<sha>"
//
// The version is the repository-root VERSION file, the same one the web app
// embeds, so the Backoffice can tell a stale cached frontend from the API it
// talks to. A plain `go build` / `go run` keeps the "dev" fallback.
package buildinfo

// Version is the app's semver (VERSION file), or "dev" for a source build.
var Version = "dev"

// Commit is the git commit the binary was built from; empty when unknown.
var Commit = ""
