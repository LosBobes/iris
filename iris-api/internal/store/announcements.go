package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Platform announcements (migration v29). A superadmin writes them in the
// Backoffice; organization users read the ones currently active for their
// organization. Rows are platform-level (no tenant_id); targeting a subset of
// organizations goes through platform_announcement_tenants, keyed by tenant
// id so a renamed slug stays targeted and a deleted organization drops out.

// ErrAnnouncementNotFound means no announcement has that id.
var ErrAnnouncementNotFound = errors.New("announcement not found")

// AnnouncementStore is the organization-facing read side. Only SQLStore
// implements it; without it the API simply reports no announcements.
type AnnouncementStore interface {
	// ActiveAnnouncements lists the announcements active at now that target
	// the tenant in ctx: maintenance first, then warning, then info, newest
	// first within a severity.
	ActiveAnnouncements(ctx context.Context, now time.Time) ([]domain.Announcement, error)
}

var _ AnnouncementStore = (*SQLStore)(nil)

// announcementTime is the stored form: UTC, second precision, so the TEXT
// columns compare chronologically on both engines.
const announcementTime = "2006-01-02T15:04:05Z"

func formatAnnouncementTime(t time.Time) string {
	return t.UTC().Format(announcementTime)
}

func parseAnnouncementTime(value, label string) (string, error) {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return "", newValidationError(label + " nije ispravno vreme.")
	}
	return formatAnnouncementTime(parsed), nil
}

func announcementStatus(a domain.Announcement, now string) string {
	switch {
	case a.StartsAt > now:
		return domain.AnnouncementScheduled
	case a.EndsAt != nil && *a.EndsAt <= now:
		return domain.AnnouncementEnded
	default:
		return domain.AnnouncementActive
	}
}

func newAnnouncementID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create announcement id: %w", err)
	}
	return "ann-" + hex.EncodeToString(raw[:]), nil
}

// normalizedAnnouncement is a validated input, ready to store.
type normalizedAnnouncement struct {
	message, severity, startsAt string
	endsAt                      *string
	allTenants                  bool
	tenants                     []domain.Tenant
}

func (s *SQLStore) normalizeAnnouncement(ctx context.Context, input domain.PlatformAnnouncementInput, now string, requireFutureEnd bool) (normalizedAnnouncement, error) {
	var out normalizedAnnouncement
	out.message = strings.TrimSpace(input.Message)
	if out.message == "" {
		return out, newValidationError("Tekst obaveštenja je obavezan.")
	}
	if len([]rune(out.message)) > domain.MaxAnnouncementMessageLength {
		return out, newValidationError(fmt.Sprintf("Tekst obaveštenja je predugačak (najviše %d znakova).", domain.MaxAnnouncementMessageLength))
	}
	switch input.Severity {
	case domain.AnnouncementInfo, domain.AnnouncementWarning, domain.AnnouncementMaintenance:
		out.severity = input.Severity
	default:
		return out, newValidationError("Nepoznata vrsta obaveštenja.")
	}
	out.startsAt = now
	if input.StartsAt != nil && strings.TrimSpace(*input.StartsAt) != "" {
		start, err := parseAnnouncementTime(*input.StartsAt, "Početak")
		if err != nil {
			return out, err
		}
		out.startsAt = start
	}
	if input.EndsAt != nil && strings.TrimSpace(*input.EndsAt) != "" {
		end, err := parseAnnouncementTime(*input.EndsAt, "Kraj")
		if err != nil {
			return out, err
		}
		if end <= out.startsAt {
			return out, newValidationError("Kraj mora biti posle početka.")
		}
		if requireFutureEnd && end <= now {
			return out, newValidationError("Kraj mora biti u budućnosti.")
		}
		out.endsAt = &end
	}
	out.allTenants = input.AllTenants
	if out.allTenants {
		return out, nil
	}
	seen := map[string]bool{}
	for _, raw := range input.TenantSlugs {
		slug := strings.ToLower(strings.TrimSpace(raw))
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		tenant, err := s.TenantBySlug(ctx, slug)
		if err != nil {
			return out, err
		}
		if tenant == nil {
			return out, newValidationError(fmt.Sprintf("Organizacija „%s” ne postoji.", slug))
		}
		out.tenants = append(out.tenants, *tenant)
	}
	if len(out.tenants) == 0 {
		return out, newValidationError("Izaberite bar jednu organizaciju ili sve organizacije.")
	}
	return out, nil
}

func announcementAuditDetail(id string, a normalizedAnnouncement) map[string]string {
	message := []rune(a.message)
	if len(message) > 80 {
		message = append(message[:79], '…')
	}
	target := "all"
	if !a.allTenants {
		slugs := make([]string, 0, len(a.tenants))
		for _, tenant := range a.tenants {
			slugs = append(slugs, tenant.Slug)
		}
		target = strings.Join(slugs, ",")
	}
	return map[string]string{"announcementId": id, "severity": a.severity, "message": string(message), "target": target}
}

func writeAnnouncementTargets(ctx context.Context, tx *sql.Tx, id string, a normalizedAnnouncement) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM platform_announcement_tenants WHERE announcement_id = ?`, id); err != nil {
		return fmt.Errorf("clear announcement targets: %w", err)
	}
	if a.allTenants {
		return nil
	}
	for _, tenant := range a.tenants {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO platform_announcement_tenants(announcement_id, tenant_id) VALUES (?, ?)`,
			id, tenant.ID,
		); err != nil {
			return fmt.Errorf("add announcement target: %w", err)
		}
	}
	return nil
}

const platformAnnouncementSelect = `
	SELECT id, message, severity, starts_at, ends_at, all_tenants, created_at, created_by, updated_at
	FROM platform_announcements`

func scanPlatformAnnouncement(row interface{ Scan(...any) error }) (domain.PlatformAnnouncement, error) {
	var a domain.PlatformAnnouncement
	var endsAt sql.NullString
	var all int
	err := row.Scan(&a.ID, &a.Message, &a.Severity, &a.StartsAt, &endsAt, &all, &a.CreatedAt, &a.CreatedBy, &a.UpdatedAt)
	if endsAt.Valid {
		a.EndsAt = &endsAt.String
	}
	a.AllTenants = all != 0
	a.Tenants = []domain.PlatformAnnouncementTenant{}
	return a, err
}

// attachAnnouncementTargets fills in each announcement's targeted
// organizations and its status at now.
func (s *SQLStore) attachAnnouncementTargets(ctx context.Context, items []domain.PlatformAnnouncement, now string) error {
	index := map[string]int{}
	for i := range items {
		index[items[i].ID] = i
		items[i].Status = announcementStatus(items[i].Announcement, now)
	}
	if len(items) == 0 {
		return nil
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT x.announcement_id, t.slug, t.name
		FROM platform_announcement_tenants x JOIN tenants t ON t.id = x.tenant_id
		ORDER BY t.name COLLATE NOCASE`)
	if err != nil {
		return fmt.Errorf("list announcement targets: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var tenant domain.PlatformAnnouncementTenant
		if err := rows.Scan(&id, &tenant.Slug, &tenant.Name); err != nil {
			return fmt.Errorf("scan announcement target: %w", err)
		}
		if i, ok := index[id]; ok {
			items[i].Tenants = append(items[i].Tenants, tenant)
		}
	}
	return rows.Err()
}

// PlatformAnnouncements lists every announcement, latest start first.
func (s *SQLStore) PlatformAnnouncements(ctx context.Context, now time.Time) ([]domain.PlatformAnnouncement, error) {
	rows, err := s.db.QueryContext(ctx, platformAnnouncementSelect+` ORDER BY starts_at DESC, created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list announcements: %w", err)
	}
	items := []domain.PlatformAnnouncement{}
	for rows.Next() {
		item, err := scanPlatformAnnouncement(rows)
		if err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan announcement: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	if err := s.attachAnnouncementTargets(ctx, items, formatAnnouncementTime(now)); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *SQLStore) platformAnnouncementByID(ctx context.Context, id string, now time.Time) (*domain.PlatformAnnouncement, error) {
	item, err := scanPlatformAnnouncement(s.db.QueryRowContext(ctx, platformAnnouncementSelect+` WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAnnouncementNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load announcement: %w", err)
	}
	items := []domain.PlatformAnnouncement{item}
	if err := s.attachAnnouncementTargets(ctx, items, formatAnnouncementTime(now)); err != nil {
		return nil, err
	}
	return &items[0], nil
}

// PlatformCreateAnnouncement stores a new announcement and audits it.
func (s *SQLStore) PlatformCreateAnnouncement(ctx context.Context, actor AuditActor, input domain.PlatformAnnouncementInput, now time.Time) (*domain.PlatformAnnouncement, error) {
	stamp := formatAnnouncementTime(now)
	a, err := s.normalizeAnnouncement(ctx, input, stamp, true)
	if err != nil {
		return nil, err
	}
	id, err := newAnnouncementID()
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create announcement: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO platform_announcements(id, message, severity, starts_at, ends_at, all_tenants, created_at, created_by, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, a.message, a.severity, a.startsAt, a.endsAt, boolInt(a.allTenants), stamp, actor.AdminUsername, stamp,
	); err != nil {
		return nil, fmt.Errorf("create announcement: %w", err)
	}
	if err := writeAnnouncementTargets(ctx, tx, id, a); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{action: domain.AuditAnnouncementCreate, detail: announcementAuditDetail(id, a)}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create announcement: %w", err)
	}
	return s.platformAnnouncementByID(ctx, id, now)
}

// PlatformUpdateAnnouncement replaces an announcement's message, severity,
// window and targets, and audits it.
func (s *SQLStore) PlatformUpdateAnnouncement(ctx context.Context, actor AuditActor, id string, input domain.PlatformAnnouncementInput, now time.Time) (*domain.PlatformAnnouncement, error) {
	if _, err := s.platformAnnouncementByID(ctx, id, now); err != nil {
		return nil, err
	}
	a, err := s.normalizeAnnouncement(ctx, input, formatAnnouncementTime(now), false)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update announcement: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE platform_announcements
		    SET message = ?, severity = ?, starts_at = ?, ends_at = ?, all_tenants = ?, updated_at = ?
		  WHERE id = ?`,
		a.message, a.severity, a.startsAt, a.endsAt, boolInt(a.allTenants), formatAnnouncementTime(now), id,
	); err != nil {
		return nil, fmt.Errorf("update announcement: %w", err)
	}
	if err := writeAnnouncementTargets(ctx, tx, id, a); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{action: domain.AuditAnnouncementUpdate, detail: announcementAuditDetail(id, a)}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update announcement: %w", err)
	}
	return s.platformAnnouncementByID(ctx, id, now)
}

// PlatformEndAnnouncement takes an active or scheduled announcement down now.
// Ending one that has already ended changes nothing and writes no audit row.
func (s *SQLStore) PlatformEndAnnouncement(ctx context.Context, actor AuditActor, id string, now time.Time) (*domain.PlatformAnnouncement, error) {
	current, err := s.platformAnnouncementByID(ctx, id, now)
	if err != nil {
		return nil, err
	}
	if current.Status == domain.AnnouncementEnded {
		return current, nil
	}
	stamp := formatAnnouncementTime(now)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin end announcement: %w", err)
	}
	defer tx.Rollback()
	// A scheduled one never showed: its window collapses to this instant.
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE platform_announcements
		    SET starts_at = CASE WHEN starts_at > ? THEN ? ELSE starts_at END, ends_at = ?, updated_at = ?
		  WHERE id = ?`,
		stamp, stamp, stamp, stamp, id,
	); err != nil {
		return nil, fmt.Errorf("end announcement: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditAnnouncementEnd,
		detail: platformAnnouncementAuditDetail(*current),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit end announcement: %w", err)
	}
	return s.platformAnnouncementByID(ctx, id, now)
}

// PlatformDeleteAnnouncement removes an announcement (and its targets).
func (s *SQLStore) PlatformDeleteAnnouncement(ctx context.Context, actor AuditActor, id string, now time.Time) error {
	current, err := s.platformAnnouncementByID(ctx, id, now)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete announcement: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM platform_announcement_tenants WHERE announcement_id = ?`, id); err != nil {
		return fmt.Errorf("delete announcement targets: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM platform_announcements WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete announcement: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditAnnouncementDelete,
		detail: platformAnnouncementAuditDetail(*current),
	}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete announcement: %w", err)
	}
	return nil
}

func platformAnnouncementAuditDetail(a domain.PlatformAnnouncement) map[string]string {
	n := normalizedAnnouncement{message: a.Message, severity: a.Severity, allTenants: a.AllTenants}
	for _, tenant := range a.Tenants {
		n.tenants = append(n.tenants, domain.Tenant{Slug: tenant.Slug})
	}
	return announcementAuditDetail(a.ID, n)
}

// ActiveAnnouncements implements AnnouncementStore.
func (s *SQLStore) ActiveAnnouncements(ctx context.Context, now time.Time) ([]domain.Announcement, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	stamp := formatAnnouncementTime(now)
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.message, a.severity, a.starts_at, a.ends_at
		FROM platform_announcements a
		WHERE a.starts_at <= ? AND (a.ends_at IS NULL OR a.ends_at > ?)
		  AND (a.all_tenants = 1 OR EXISTS (
		      SELECT 1 FROM platform_announcement_tenants x
		      WHERE x.announcement_id = a.id AND x.tenant_id = ?))
		ORDER BY CASE a.severity WHEN 'maintenance' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.starts_at DESC, a.id`,
		stamp, stamp, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list active announcements: %w", err)
	}
	defer rows.Close()
	items := []domain.Announcement{}
	for rows.Next() {
		var a domain.Announcement
		var endsAt sql.NullString
		if err := rows.Scan(&a.ID, &a.Message, &a.Severity, &a.StartsAt, &endsAt); err != nil {
			return nil, fmt.Errorf("scan announcement: %w", err)
		}
		if endsAt.Valid {
			a.EndsAt = &endsAt.String
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

// platformAnnouncementsMigration (v29) adds the announcement tables.
const platformAnnouncementsMigration = `
CREATE TABLE IF NOT EXISTS platform_announcements (
	id TEXT PRIMARY KEY,
	message TEXT NOT NULL,
	severity TEXT NOT NULL,
	starts_at TEXT NOT NULL,
	ends_at TEXT,
	all_tenants INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL,
	created_by TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_window ON platform_announcements(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS platform_announcement_tenants (
	announcement_id TEXT NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	PRIMARY KEY (announcement_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_announcement_tenants_tenant ON platform_announcement_tenants(tenant_id);
`
