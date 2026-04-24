package store

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestFixtureStoreUsers(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	users, err := store.Users()
	if err != nil {
		t.Fatalf("Users() returned error: %v", err)
	}

	if len(users) != 1 {
		t.Fatalf("Users() length = %d, want 1", len(users))
	}

	if users[0].Username != "admin" {
		t.Fatalf("Users()[0].Username = %q, want %q", users[0].Username, "admin")
	}
}

func TestFixtureStoreOperatorsSortedUnique(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	operators, err := store.Operators()
	if err != nil {
		t.Fatalf("Operators() returned error: %v", err)
	}

	want := []string{"ana.jovic", "jelena.markovic", "marko.petrovic", "stefan.nikolic"}
	if len(operators) != len(want) {
		t.Fatalf("Operators() length = %d, want %d", len(operators), len(want))
	}

	for i := range want {
		if operators[i] != want[i] {
			t.Fatalf("Operators()[%d] = %q, want %q", i, operators[i], want[i])
		}
	}
}

func TestFixtureStoreMissingFile(t *testing.T) {
	tempDir := t.TempDir()
	store := NewFixtureStore(tempDir)

	_, err := store.Users()
	if err == nil {
		t.Fatal("Users() error = nil, want non-nil for missing file")
	}
}
