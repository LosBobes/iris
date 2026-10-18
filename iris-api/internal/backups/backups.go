// Package backups manages SQLite backup copies in one directory: taking a
// copy on demand or on a schedule, listing the copies and pruning old ones.
//
// File names are always generated here (iris-YYYYMMDD-HHMMSS[-N].db, UTC);
// nothing a client sends ever becomes part of a path, and only files matching
// that pattern are listed or pruned, so a backup directory shared with other
// files is safe. Copies are never served over HTTP: the Backoffice only lists
// them. PostgreSQL has no in-process backup (use pg_dump, deploy/POSTGRES.md),
// so the server does not create a Manager there.
package backups

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Environment variables read by FromEnv.
const (
	EnvDir        = "IRIS_BACKUP_DIR"
	EnvKeep       = "IRIS_BACKUP_KEEP"
	EnvInterval   = "IRIS_BACKUP_INTERVAL"
	EnvStaleHours = "IRIS_BACKUP_STALE_HOURS"
)

const (
	// DefaultKeep is how many copies are kept when IRIS_BACKUP_KEEP is unset.
	DefaultKeep = 14
	// DefaultStaleHours is when the Backoffice starts warning that the newest
	// copy is too old.
	DefaultStaleHours = 24
	// MinInterval is the shortest accepted IRIS_BACKUP_INTERVAL.
	MinInterval = 15 * time.Minute
	// listLimit caps how many copies the Backoffice lists.
	listLimit = 50
)

var namePattern = regexp.MustCompile(`^iris-(\d{8}-\d{6})(?:-(\d+))?\.db$`)

// BackupFunc writes a consistent copy of the database to path, which must not
// exist yet (store.SQLStore.Backup).
type BackupFunc func(ctx context.Context, path string) error

// File is one backup copy in the directory.
type File struct {
	Name      string
	SizeBytes int64
	CreatedAt time.Time
}

// Config describes where copies go and how many are kept.
type Config struct {
	Dir string
	// Keep is the number of newest copies retained after each new one; 0 keeps
	// every copy.
	Keep int
	// Interval enables the automatic schedule (Run); 0 disables it.
	Interval time.Duration
	// StaleAfter is the age after which the newest copy counts as overdue.
	StaleAfter time.Duration
}

// Manager takes, lists and prunes copies. It is safe for concurrent use; two
// backups never run at the same time.
type Manager struct {
	config Config
	backup BackupFunc
	now    func() time.Time
	// minWait is the shortest pause of the schedule (Run).
	minWait time.Duration
	mu      sync.Mutex
}

func New(config Config, backup BackupFunc) *Manager {
	if config.StaleAfter <= 0 {
		config.StaleAfter = DefaultStaleHours * time.Hour
	}
	if config.Keep < 0 {
		config.Keep = 0
	}
	return &Manager{config: config, backup: backup, now: time.Now, minWait: time.Minute}
}

// FromEnv reads the IRIS_BACKUP_* variables. The directory defaults to a
// "backups" folder next to the SQLite database. Invalid values are reported
// and replaced by the defaults rather than stopping the server.
func FromEnv(databasePath string) Config {
	config := Config{
		Dir:        strings.TrimSpace(os.Getenv(EnvDir)),
		Keep:       DefaultKeep,
		StaleAfter: DefaultStaleHours * time.Hour,
	}
	if config.Dir == "" {
		config.Dir = filepath.Join(filepath.Dir(databasePath), "backups")
	}
	if raw := strings.TrimSpace(os.Getenv(EnvKeep)); raw != "" {
		if keep, err := strconv.Atoi(raw); err == nil && keep >= 0 {
			config.Keep = keep
		} else {
			log.Printf("warning: %s=%q is not a whole number >= 0; keeping %d copies", EnvKeep, raw, DefaultKeep)
		}
	}
	if raw := strings.TrimSpace(os.Getenv(EnvInterval)); raw != "" && raw != "0" {
		interval, err := time.ParseDuration(raw)
		switch {
		case err != nil:
			log.Printf("warning: %s=%q is not a duration (e.g. 24h); automatic backups are off", EnvInterval, raw)
		case interval < MinInterval:
			log.Printf("warning: %s=%q is shorter than %s; using %s", EnvInterval, raw, MinInterval, MinInterval)
			config.Interval = MinInterval
		default:
			config.Interval = interval
		}
	}
	if raw := strings.TrimSpace(os.Getenv(EnvStaleHours)); raw != "" {
		if hours, err := strconv.Atoi(raw); err == nil && hours > 0 {
			config.StaleAfter = time.Duration(hours) * time.Hour
		} else {
			log.Printf("warning: %s=%q is not a whole number > 0; using %d", EnvStaleHours, raw, DefaultStaleHours)
		}
	}
	return config
}

func (m *Manager) Config() Config { return m.config }

// Create takes a new copy, then prunes the directory down to Keep copies.
func (m *Manager) Create(ctx context.Context) (File, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := os.MkdirAll(m.config.Dir, 0o750); err != nil {
		return File{}, fmt.Errorf("create backup directory: %w", err)
	}
	now := m.now().UTC()
	stamp := now.Format("20060102-150405")
	name := "iris-" + stamp + ".db"
	for n := 2; fileExists(filepath.Join(m.config.Dir, name)); n++ {
		name = fmt.Sprintf("iris-%s-%d.db", stamp, n)
	}
	// Write under a name the listing ignores, so a half-written copy is never
	// shown or counted, then move it into place.
	final := filepath.Join(m.config.Dir, name)
	partial := final + ".partial"
	_ = os.Remove(partial)
	if err := m.backup(ctx, partial); err != nil {
		_ = os.Remove(partial)
		return File{}, err
	}
	if err := os.Rename(partial, final); err != nil {
		_ = os.Remove(partial)
		return File{}, fmt.Errorf("finish backup: %w", err)
	}
	info, err := os.Stat(final)
	if err != nil {
		return File{}, fmt.Errorf("stat backup: %w", err)
	}
	if err := m.prune(); err != nil {
		log.Printf("prune backups: %v", err)
	}
	return File{Name: name, SizeBytes: info.Size(), CreatedAt: info.ModTime().UTC()}, nil
}

// List returns the copies, newest first (at most 50), and the total count.
func (m *Manager) List() ([]File, int, error) {
	files, err := m.all()
	if err != nil {
		return nil, 0, err
	}
	total := len(files)
	if len(files) > listLimit {
		files = files[:listLimit]
	}
	return files, total, nil
}

// Latest returns the newest copy, or nil when there is none.
func (m *Manager) Latest() (*File, error) {
	files, err := m.all()
	if err != nil || len(files) == 0 {
		return nil, err
	}
	return &files[0], nil
}

// Stale reports whether the newest copy (nil: none) is older than StaleAfter.
func (m *Manager) Stale(latest *File) bool {
	return latest == nil || m.now().Sub(latest.CreatedAt) > m.config.StaleAfter
}

func (m *Manager) all() ([]File, error) {
	entries, err := os.ReadDir(m.config.Dir)
	if errors.Is(err, os.ErrNotExist) {
		return []File{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read backup directory: %w", err)
	}
	files := []File{}
	for _, entry := range entries {
		// Only regular files with our own names: no directories, no symlinks.
		if !entry.Type().IsRegular() || !namePattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, File{Name: entry.Name(), SizeBytes: info.Size(), CreatedAt: info.ModTime().UTC()})
	}
	sort.Slice(files, func(i, j int) bool { return sortKey(files[i].Name) > sortKey(files[j].Name) })
	return files, nil
}

// sortKey orders names by their timestamp, then their -N suffix.
func sortKey(name string) string {
	match := namePattern.FindStringSubmatch(name)
	if match == nil {
		return ""
	}
	n, _ := strconv.Atoi(match[2])
	return fmt.Sprintf("%s-%06d", match[1], n)
}

func (m *Manager) prune() error {
	if m.config.Keep == 0 {
		return nil
	}
	files, err := m.all()
	if err != nil {
		return err
	}
	for _, file := range files[min(m.config.Keep, len(files)):] {
		if err := os.Remove(filepath.Join(m.config.Dir, file.Name)); err != nil {
			return fmt.Errorf("remove %s: %w", file.Name, err)
		}
	}
	return nil
}

// Run takes a copy whenever the newest one is Interval old, until ctx ends.
// It waits at least a minute after start, so a restart loop cannot turn into
// a backup loop, and it counts copies taken by hand or by irisctl.
func (m *Manager) Run(ctx context.Context) {
	if m.config.Interval <= 0 {
		return
	}
	for {
		wait := m.config.Interval
		if latest, err := m.Latest(); err != nil {
			log.Printf("scheduled backup: %v", err)
		} else if latest != nil {
			wait = m.config.Interval - m.now().Sub(latest.CreatedAt)
		} else {
			wait = 0
		}
		if wait < m.minWait {
			wait = m.minWait
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if latest, err := m.Latest(); err == nil && latest != nil && m.now().Sub(latest.CreatedAt) < m.config.Interval-m.minWait {
			continue // someone took a copy while we waited
		}
		file, err := m.Create(ctx)
		if err != nil {
			log.Printf("scheduled backup failed: %v", err)
			continue
		}
		log.Printf("scheduled backup saved: %s (%d bytes)", file.Name, file.SizeBytes)
	}
}

func fileExists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}
