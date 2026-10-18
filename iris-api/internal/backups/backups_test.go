package backups

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fakeBackup writes a small file in place of a database copy.
func fakeBackup(_ context.Context, path string) error {
	return os.WriteFile(path, []byte("sqlite"), 0o600)
}

func newTestManager(t *testing.T, keep int, clock *time.Time) *Manager {
	t.Helper()
	manager := New(Config{Dir: filepath.Join(t.TempDir(), "backups"), Keep: keep}, fakeBackup)
	manager.now = func() time.Time { return *clock }
	return manager
}

func TestCreateListAndPrune(t *testing.T) {
	clock := time.Date(2026, 10, 18, 8, 0, 0, 0, time.UTC)
	manager := newTestManager(t, 3, &clock)

	files, total, err := manager.List()
	if err != nil || total != 0 || len(files) != 0 {
		t.Fatalf("empty list = %v %d %v", files, total, err)
	}
	if latest, _ := manager.Latest(); latest != nil || !manager.Stale(latest) {
		t.Fatalf("no copy must count as stale, latest = %v", latest)
	}

	var names []string
	for i := 0; i < 5; i++ {
		file, err := manager.Create(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, file.Name)
		if i%2 == 1 {
			clock = clock.Add(time.Hour)
		}
	}
	// Two copies in the same second get a -2 suffix instead of clashing.
	if names[0] != "iris-20261018-080000.db" || names[1] != "iris-20261018-080000-2.db" {
		t.Fatalf("names = %v", names)
	}

	// Unrelated files and leftovers are neither listed nor pruned.
	for _, other := range []string{"notes.txt", "iris-20200101-000000.db.partial", "iris.db"} {
		if err := os.WriteFile(filepath.Join(manager.config.Dir, other), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(manager.config.Dir, "iris-20200101-000000.db"), 0o750); err != nil {
		t.Fatal(err)
	}

	files, total, err = manager.List()
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(files) != 3 {
		t.Fatalf("kept %d (%v), want 3", total, files)
	}
	want := []string{names[4], names[3], names[2]}
	for i, file := range files {
		if file.Name != want[i] || file.SizeBytes != int64(len("sqlite")) {
			t.Fatalf("files[%d] = %+v, want %s", i, file, want[i])
		}
	}
	for _, other := range []string{"notes.txt", "iris-20200101-000000.db.partial", "iris.db"} {
		if _, err := os.Stat(filepath.Join(manager.config.Dir, other)); err != nil {
			t.Fatalf("%s was touched: %v", other, err)
		}
	}
}

func TestKeepZeroKeepsEverything(t *testing.T) {
	clock := time.Date(2026, 10, 18, 8, 0, 0, 0, time.UTC)
	manager := newTestManager(t, 0, &clock)
	for i := 0; i < 4; i++ {
		if _, err := manager.Create(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if _, total, _ := manager.List(); total != 4 {
		t.Fatalf("total = %d, want 4", total)
	}
}

func TestFailedBackupLeavesNothing(t *testing.T) {
	clock := time.Date(2026, 10, 18, 8, 0, 0, 0, time.UTC)
	manager := New(Config{Dir: t.TempDir()}, func(_ context.Context, path string) error {
		_ = os.WriteFile(path, []byte("half"), 0o600)
		return errors.New("disk full")
	})
	manager.now = func() time.Time { return clock }
	if _, err := manager.Create(context.Background()); err == nil {
		t.Fatal("want error")
	}
	entries, _ := os.ReadDir(manager.config.Dir)
	if len(entries) != 0 {
		t.Fatalf("left behind %v", entries)
	}
}

func TestStale(t *testing.T) {
	clock := time.Date(2026, 10, 18, 8, 0, 0, 0, time.UTC)
	manager := New(Config{Dir: t.TempDir(), StaleAfter: 24 * time.Hour}, fakeBackup)
	manager.now = func() time.Time { return clock }
	fresh := &File{CreatedAt: clock.Add(-23 * time.Hour)}
	old := &File{CreatedAt: clock.Add(-25 * time.Hour)}
	if manager.Stale(fresh) || !manager.Stale(old) {
		t.Fatal("stale threshold is 24 h")
	}
}

func TestFromEnv(t *testing.T) {
	t.Setenv(EnvDir, "")
	t.Setenv(EnvKeep, "")
	t.Setenv(EnvInterval, "")
	t.Setenv(EnvStaleHours, "")
	config := FromEnv(filepath.Join("data", "iris.db"))
	if config.Dir != filepath.Join("data", "backups") || config.Keep != DefaultKeep || config.Interval != 0 || config.StaleAfter != 24*time.Hour {
		t.Fatalf("defaults = %+v", config)
	}

	t.Setenv(EnvDir, "/srv/backups")
	t.Setenv(EnvKeep, "0")
	t.Setenv(EnvInterval, "6h")
	t.Setenv(EnvStaleHours, "12")
	config = FromEnv("iris.db")
	if config.Dir != "/srv/backups" || config.Keep != 0 || config.Interval != 6*time.Hour || config.StaleAfter != 12*time.Hour {
		t.Fatalf("explicit = %+v", config)
	}

	t.Setenv(EnvKeep, "-1")
	t.Setenv(EnvInterval, "1m")
	t.Setenv(EnvStaleHours, "soon")
	config = FromEnv("iris.db")
	if config.Keep != DefaultKeep || config.Interval != MinInterval || config.StaleAfter != 24*time.Hour {
		t.Fatalf("invalid values = %+v", config)
	}
	t.Setenv(EnvInterval, "daily")
	if config = FromEnv("iris.db"); config.Interval != 0 {
		t.Fatalf("unparsable interval = %s, want off", config.Interval)
	}
}

func TestRunTakesOverdueBackupAndStops(t *testing.T) {
	created := make(chan string, 4)
	manager := New(Config{Dir: t.TempDir(), Interval: time.Hour}, func(ctx context.Context, path string) error {
		created <- filepath.Base(path)
		return fakeBackup(ctx, path)
	})
	manager.minWait = 10 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		manager.Run(ctx)
		close(done)
	}()
	select {
	case <-created:
	case <-time.After(5 * time.Second):
		t.Fatal("no copy taken although none existed")
	}
	// The fresh copy is not due again for an hour.
	select {
	case name := <-created:
		t.Fatalf("second copy %s taken too early", name)
	case <-time.After(100 * time.Millisecond):
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop")
	}
}
