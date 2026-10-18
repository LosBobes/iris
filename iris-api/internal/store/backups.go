package store

import (
	"context"
	"fmt"
	"strconv"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// SystemStore is what the Backoffice System panel reads from the database,
// plus the audit row for a backup taken from the Backoffice. The backup files
// themselves are handled by internal/backups.
type SystemStore interface {
	// DatabaseEngine is "sqlite" or "postgres".
	DatabaseEngine() string
	// SchemaVersion is the highest applied migration.
	SchemaVersion(ctx context.Context) (int, error)
	// PlatformRecordBackup writes the platform_audit_events row for a backup
	// a superadmin took.
	PlatformRecordBackup(ctx context.Context, actor AuditActor, name string, sizeBytes int64) error
}

var _ SystemStore = (*SQLStore)(nil)

const (
	EngineSQLite   = "sqlite"
	EnginePostgres = "postgres"
)

func (s *SQLStore) DatabaseEngine() string {
	if s.dialect == dialectPostgres {
		return EnginePostgres
	}
	return EngineSQLite
}

// BackupSupported reports whether Backup can copy this database in-process.
func (s *SQLStore) BackupSupported() bool { return s.dialect != dialectPostgres }

func (s *SQLStore) SchemaVersion(ctx context.Context) (int, error) {
	var version int
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&version); err != nil {
		return 0, fmt.Errorf("schema version: %w", err)
	}
	return version, nil
}

func (s *SQLStore) PlatformRecordBackup(ctx context.Context, actor AuditActor, name string, sizeBytes int64) error {
	return writeAudit(ctx, s.db, actor, auditEntry{
		action: domain.AuditBackupCreate,
		detail: map[string]string{"name": name, "sizeBytes": strconv.FormatInt(sizeBytes, 10)},
	})
}
