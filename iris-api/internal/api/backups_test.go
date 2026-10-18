package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/backups"
	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func listBackups(t *testing.T, server *Server, cookie *http.Cookie) domain.PlatformBackups {
	t.Helper()
	rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/backups", "")
	var result domain.PlatformBackups
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("backups = %d %s", rec.Code, rec.Body.String())
	}
	return result
}

func TestPlatformBackupRoutesNeedSuperadmin(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		if rec := platformRequest(t, server, tenantCookie, method, "/platform/backups", ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s /platform/backups with tenant session = %d, want 401", method, rec.Code)
		}
	}
}

func TestPlatformBackups(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	sqliteStore := server.store.(*store.SQLStore)
	dir := filepath.Join(t.TempDir(), "backups")
	server.config.Backups = backups.New(backups.Config{Dir: dir, Keep: 2}, sqliteStore.Backup)
	cookie := signedInPlatform(t, server)

	empty := listBackups(t, server, cookie)
	if !empty.Supported || empty.Engine != "sqlite" || empty.Directory != dir || empty.Keep != 2 ||
		empty.Total != 0 || len(empty.Items) != 0 || empty.LastBackupAt != nil || !empty.Stale || empty.StaleAfterHours != 24 {
		t.Fatalf("empty = %+v", empty)
	}

	var created domain.PlatformBackup
	for i := 0; i < 3; i++ {
		rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/backups", "")
		if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated {
			t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
		}
	}
	if created.SizeBytes <= 0 || created.CreatedAt == "" {
		t.Fatalf("created = %+v", created)
	}
	// The copy is a real, openable database.
	copyStore, err := store.OpenSQLite(context.Background(), filepath.Join(dir, created.Name))
	if err != nil {
		t.Fatalf("open backup: %v", err)
	}
	_ = copyStore.Close()

	list := listBackups(t, server, cookie)
	if list.Total != 2 || len(list.Items) != 2 || list.Items[0].Name != created.Name || list.Stale || list.LastBackupAt == nil {
		t.Fatalf("after three copies with keep 2 = %+v", list)
	}

	events := auditActions(t, server, cookie)
	count := 0
	for _, event := range events {
		if event.Action == domain.AuditBackupCreate {
			count++
			if event.AdminUsername != "ops" || event.Detail["name"] == "" {
				t.Fatalf("audit = %+v", event)
			}
		}
	}
	if count != 3 {
		t.Fatalf("backup audit rows = %d, want 3", count)
	}

	rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", "")
	var metrics domain.PlatformMetrics
	if err := json.Unmarshal(rec.Body.Bytes(), &metrics); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("metrics = %d %s", rec.Code, rec.Body.String())
	}
	system := metrics.System
	if system.DatabaseEngine != "sqlite" || system.SchemaVersion < 25 || !system.Backup.Supported || system.Backup.Stale || system.Backup.LastBackupAt == nil {
		t.Fatalf("system = %+v", system)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatal(err)
	}
}

// Without a Manager (PostgreSQL) the routes say so instead of failing.
func TestPlatformBackupsUnsupported(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)

	list := listBackups(t, server, cookie)
	if list.Supported || list.Stale || len(list.Items) != 0 || list.Directory != "" {
		t.Fatalf("unsupported list = %+v", list)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/backups", ""); rec.Code != http.StatusConflict {
		t.Fatalf("create without manager = %d, want 409", rec.Code)
	}
	for _, event := range auditActions(t, server, cookie) {
		if event.Action == domain.AuditBackupCreate {
			t.Fatalf("refused backup was audited: %+v", event)
		}
	}
}
