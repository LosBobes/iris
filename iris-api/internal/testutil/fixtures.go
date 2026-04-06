package testutil

import (
	"os"
	"path/filepath"
	"testing"
)

// FixtureDir locates the shared desktop fixture directory for tests.
func FixtureDir(t *testing.T) string {
	t.Helper()

	candidates := []string{
		filepath.Join("..", "..", "..", "apps", "desktop", "fixtures"),
		filepath.Join("/Users/vbatocanin/Dev/GitHub/iris", "apps", "desktop", "fixtures"),
	}

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}

	t.Fatalf("could not locate fixture directory")
	return ""
}
