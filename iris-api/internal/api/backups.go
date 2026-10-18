package api

import (
	"log"
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/backups"
	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// Backoffice backups (GET/POST /platform/backups). Copies are written by
// internal/backups into Config.Backups' directory under generated names; the
// API only lists them and never serves a file. On PostgreSQL there is no
// Manager and the routes report supported: false (pg_dump runs outside).

const backupsUnsupportedMessage = "Rezervne kopije ove baze se prave van aplikacije (PostgreSQL: pg_dump)."

func (s *Server) systemStore() (store.SystemStore, bool) {
	system, ok := s.store.(store.SystemStore)
	return system, ok
}

func (s *Server) databaseEngine() string {
	if system, ok := s.systemStore(); ok {
		return system.DatabaseEngine()
	}
	return ""
}

func backupFile(file backups.File) domain.PlatformBackup {
	return domain.PlatformBackup{
		Name:      file.Name,
		SizeBytes: file.SizeBytes,
		CreatedAt: file.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// backupStatus is the dashboard summary; supported only with a Manager.
func (s *Server) backupStatus() domain.PlatformBackupStatus {
	manager := s.config.Backups
	if manager == nil {
		return domain.PlatformBackupStatus{}
	}
	config := manager.Config()
	status := domain.PlatformBackupStatus{
		Supported:       true,
		StaleAfterHours: int(config.StaleAfter / time.Hour),
		IntervalSeconds: int64(config.Interval / time.Second),
	}
	latest, err := manager.Latest()
	if err != nil {
		log.Printf("backup status: %v", err)
	}
	if latest != nil {
		at := latest.CreatedAt.UTC().Format(time.RFC3339)
		status.LastBackupAt = &at
	}
	status.Stale = err == nil && manager.Stale(latest)
	return status
}

func (s *Server) handlePlatformBackups(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	result := domain.PlatformBackups{
		PlatformBackupStatus: s.backupStatus(),
		Engine:               s.databaseEngine(),
		Items:                []domain.PlatformBackup{},
	}
	if manager := s.config.Backups; manager != nil {
		files, total, err := manager.List()
		if err != nil {
			writeServerError(w, r, err)
			return
		}
		config := manager.Config()
		result.Directory = config.Dir
		result.Keep = config.Keep
		result.Total = total
		for _, file := range files {
			result.Items = append(result.Items, backupFile(file))
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePlatformCreateBackup(w http.ResponseWriter, r *http.Request) {
	manager := s.config.Backups
	system, ok := s.systemStore()
	if manager == nil || !ok {
		writeAPIError(w, r, http.StatusConflict, backupsUnsupportedMessage, nil)
		return
	}
	file, err := manager.Create(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	actor := auditActor(r)
	if err := system.PlatformRecordBackup(r.Context(), actor, file.Name, file.SizeBytes); err != nil {
		writeServerError(w, r, err)
		return
	}
	log.Printf("backup %s (%d bytes) taken by platform admin %q", file.Name, file.SizeBytes, actor.AdminUsername)
	writeJSON(w, http.StatusCreated, backupFile(file))
}
