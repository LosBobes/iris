package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

// PlatformStore is the operator-only side of the store: platform admin accounts
// (not tied to any organization), their sessions, and the cross-tenant usage
// metrics they can read. It is deliberately separate from Store so the
// tenant-scoped code paths never see it, and only the SQLite store implements
// it; the API enables the /platform routes only when it is available.
//
// The metrics are aggregates only (counts, dates, sizes). Nothing here returns
// a customer, user, work order or any other personal or business record.
type PlatformStore interface {
	UpsertPlatformAdmin(ctx context.Context, username, password string) error
	AuthenticatePlatformAdmin(ctx context.Context, username, password string) (*domain.PlatformAdmin, error)
	CreatePlatformSession(ctx context.Context, adminID string, expiresAt time.Time) (string, error)
	PlatformAdminBySession(ctx context.Context, token string) (*domain.PlatformAdmin, error)
	DeletePlatformSession(ctx context.Context, token string) error
	RecordLogin(ctx context.Context, tenantID, userID string, at time.Time) error
	PlatformMetrics(ctx context.Context, now time.Time, rangeDays int) (domain.PlatformMetrics, error)
}

var _ PlatformStore = (*SQLiteStore)(nil)

// MinPlatformAdminPasswordLength is enforced when an operator account is
// created: it can read usage across every organization.
const MinPlatformAdminPasswordLength = 12

// loginEventRetention bounds login_events so it cannot grow forever; the
// dashboard's longest range is a year.
const loginEventRetention = 400 * 24 * time.Hour

// dummyPlatformHash is compared against when the username is unknown, so a
// failed login takes the same time whether or not the account exists.
var dummyPlatformHash, _ = bcrypt.GenerateFromPassword([]byte("iris-platform-dummy"), bcrypt.DefaultCost)

// hashPlatformToken stores session tokens hashed: a leaked database copy (a
// backup, say) must not hand out live operator sessions.
func hashPlatformToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *SQLiteStore) UpsertPlatformAdmin(ctx context.Context, username, password string) error {
	username = strings.TrimSpace(username)
	if username == "" {
		return newValidationError("Korisničko ime je obavezno.")
	}
	if len(password) < MinPlatformAdminPasswordLength {
		return newValidationError(fmt.Sprintf("Lozinka mora imati najmanje %d znakova.", MinPlatformAdminPasswordLength))
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	id := "platform-" + strings.ToLower(username)
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO platform_admins(id, username, password_hash) VALUES (?, ?, ?)
		 ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
		id, username, string(hash),
	); err != nil {
		return fmt.Errorf("save platform admin: %w", err)
	}
	return nil
}

func (s *SQLiteStore) AuthenticatePlatformAdmin(ctx context.Context, username, password string) (*domain.PlatformAdmin, error) {
	var admin domain.PlatformAdmin
	var hash string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, password_hash FROM platform_admins WHERE username = ?`,
		strings.TrimSpace(username),
	).Scan(&admin.ID, &admin.Username, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyPlatformHash, []byte(password))
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load platform admin: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return nil, nil
	}
	return &admin, nil
}

func (s *SQLiteStore) CreatePlatformSession(ctx context.Context, adminID string, expiresAt time.Time) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM platform_sessions WHERE expires_at <= ?`,
		time.Now().UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("sweep platform sessions: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO platform_sessions(token_hash, admin_id, expires_at) VALUES (?, ?, ?)`,
		hashPlatformToken(token), adminID, expiresAt.UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("create platform session: %w", err)
	}
	return token, nil
}

func (s *SQLiteStore) PlatformAdminBySession(ctx context.Context, token string) (*domain.PlatformAdmin, error) {
	if token == "" {
		return nil, nil
	}
	var admin domain.PlatformAdmin
	var expiresAtRaw string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT platform_admins.id, platform_admins.username, platform_sessions.expires_at
		 FROM platform_sessions
		 JOIN platform_admins ON platform_admins.id = platform_sessions.admin_id
		 WHERE platform_sessions.token_hash = ?`,
		hashPlatformToken(token),
	).Scan(&admin.ID, &admin.Username, &expiresAtRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load platform session: %w", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtRaw)
	if err != nil || !time.Now().UTC().Before(expiresAt) {
		_ = s.DeletePlatformSession(ctx, token)
		return nil, nil
	}
	return &admin, nil
}

func (s *SQLiteStore) DeletePlatformSession(ctx context.Context, token string) error {
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM platform_sessions WHERE token_hash = ?`,
		hashPlatformToken(token),
	); err != nil {
		return fmt.Errorf("delete platform session: %w", err)
	}
	return nil
}

// RecordLogin notes that someone signed in to an organization. Only the tenant,
// an opaque user id (used to count distinct active users) and the time are kept.
func (s *SQLiteStore) RecordLogin(ctx context.Context, tenantID, userID string, at time.Time) error {
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO login_events(tenant_id, user_id, at) VALUES (?, ?, ?)`,
		tenantID, userID, at.UTC().Format(time.RFC3339),
	); err != nil {
		return fmt.Errorf("record login: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM login_events WHERE at < ?`,
		at.Add(-loginEventRetention).UTC().Format(time.RFC3339),
	); err != nil {
		return fmt.Errorf("sweep login events: %w", err)
	}
	return nil
}

// openStatusExclusions are the statuses that mean a work order needs no more
// work; everything else counts as open.
var openStatusExclusions = map[string]bool{
	string(domain.WorkOrderStatusCompleted): true,
	string(domain.WorkOrderStatusCancelled): true,
	string(domain.WorkOrderStatusInvoiced):  true,
}

// PlatformMetrics aggregates usage across every organization. rangeDays sets
// the window for the "in range" counts and the daily series (ending today).
func (s *SQLiteStore) PlatformMetrics(ctx context.Context, now time.Time, rangeDays int) (domain.PlatformMetrics, error) {
	now = now.UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	start := today.AddDate(0, 0, -(rangeDays - 1))
	since := start.Format("2006-01-02")
	nowRaw := now.Format(time.RFC3339)

	metrics := domain.PlatformMetrics{
		GeneratedAt: nowRaw,
		RangeDays:   rangeDays,
		RangeStart:  since,
		Tenants:     []domain.PlatformTenantMetrics{},
		Daily:       []domain.PlatformDailyPoint{},
	}

	byID := map[string]*domain.PlatformTenantMetrics{}
	slugByID := map[string]string{}
	var order []string

	rows, err := s.db.QueryContext(ctx, `SELECT id, slug, name, created_at FROM tenants ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return metrics, fmt.Errorf("list tenants: %w", err)
	}
	for rows.Next() {
		tenant := domain.PlatformTenantMetrics{StatusCounts: map[string]int{}}
		if err := rows.Scan(&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.CreatedAt); err != nil {
			rows.Close()
			return metrics, fmt.Errorf("scan tenant: %w", err)
		}
		order = append(order, tenant.ID)
		slugByID[tenant.ID] = tenant.Slug
		byID[tenant.ID] = &tenant
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return metrics, err
	}

	// each runs a "tenant_id, ..." aggregate and folds every row into its tenant.
	each := func(query string, args []any, scan func(*domain.PlatformTenantMetrics, *sql.Rows) error) error {
		rows, err := s.db.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			// scan fills the row's tenant id into ID plus the metric columns.
			row := &domain.PlatformTenantMetrics{StatusCounts: map[string]int{}}
			if err := scan(row, rows); err != nil {
				return err
			}
			if target, ok := byID[row.ID]; ok {
				mergeTenantMetrics(target, row)
			}
		}
		return rows.Err()
	}

	if err := each(
		`SELECT tenant_id, COUNT(*), COALESCE(SUM(role = 'admin'), 0) FROM users GROUP BY tenant_id`, nil,
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error { return r.Scan(&t.ID, &t.Users, &t.Admins) },
	); err != nil {
		return metrics, fmt.Errorf("count users: %w", err)
	}
	if err := each(
		`SELECT tenant_id, COUNT(*) FROM customers GROUP BY tenant_id`, nil,
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error { return r.Scan(&t.ID, &t.Customers) },
	); err != nil {
		return metrics, fmt.Errorf("count customers: %w", err)
	}
	if err := each(
		`SELECT tenant_id, COUNT(*) FROM catalog_items GROUP BY tenant_id`, nil,
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error { return r.Scan(&t.ID, &t.CatalogItems) },
	); err != nil {
		return metrics, fmt.Errorf("count catalog items: %w", err)
	}
	if err := each(
		`SELECT tenant_id, status, COUNT(*),
		        COALESCE(SUM(substr(created_at, 1, 10) >= ?), 0),
		        MAX(updated_at)
		 FROM work_orders GROUP BY tenant_id, status`,
		[]any{since},
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error {
			var status string
			var count, inRange int
			var last sql.NullString
			if err := r.Scan(&t.ID, &status, &count, &inRange, &last); err != nil {
				return err
			}
			t.WorkOrders = count
			t.WorkOrdersInRange = inRange
			t.StatusCounts[status] = count
			if !openStatusExclusions[status] {
				t.OpenWorkOrders = count
			}
			if last.Valid {
				t.LastWorkOrderAt = &last.String
			}
			return nil
		},
	); err != nil {
		return metrics, fmt.Errorf("count work orders: %w", err)
	}
	if err := each(
		`SELECT tenant_id,
		        COALESCE(SUM(substr(at, 1, 10) >= ?), 0),
		        COUNT(DISTINCT CASE WHEN substr(at, 1, 10) >= ? THEN user_id END),
		        MAX(at)
		 FROM login_events GROUP BY tenant_id`,
		[]any{since, since},
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error {
			var last sql.NullString
			if err := r.Scan(&t.ID, &t.LoginsInRange, &t.ActiveUsersInRange, &last); err != nil {
				return err
			}
			if last.Valid {
				t.LastLoginAt = &last.String
			}
			return nil
		},
	); err != nil {
		return metrics, fmt.Errorf("count logins: %w", err)
	}
	if err := each(
		`SELECT users.tenant_id, COUNT(*) FROM sessions
		 JOIN users ON users.id = sessions.user_id
		 WHERE sessions.expires_at > ? GROUP BY users.tenant_id`,
		[]any{nowRaw},
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error { return r.Scan(&t.ID, &t.ActiveSessions) },
	); err != nil {
		return metrics, fmt.Errorf("count sessions: %w", err)
	}
	if err := each(
		`SELECT tenant_id, 1 FROM app_settings WHERE key = ?`,
		[]any{loginLogoSettingKey},
		func(t *domain.PlatformTenantMetrics, r *sql.Rows) error {
			var one int
			if err := r.Scan(&t.ID, &one); err != nil {
				return err
			}
			t.HasLoginLogo = true
			return nil
		},
	); err != nil {
		return metrics, fmt.Errorf("check login logos: %w", err)
	}

	// Dense daily series: every date in the range, every organization, zeros
	// included, so charts never have to guess at gaps.
	slugs := make([]string, 0, len(order))
	for _, id := range order {
		slugs = append(slugs, slugByID[id])
	}
	sort.Strings(slugs)
	dateIndex := map[string]int{}
	for day := start; !day.After(today); day = day.AddDate(0, 0, 1) {
		point := domain.PlatformDailyPoint{
			Date:       day.Format("2006-01-02"),
			WorkOrders: make(map[string]int, len(slugs)),
			Logins:     make(map[string]int, len(slugs)),
		}
		for _, slug := range slugs {
			point.WorkOrders[slug] = 0
			point.Logins[slug] = 0
		}
		dateIndex[point.Date] = len(metrics.Daily)
		metrics.Daily = append(metrics.Daily, point)
	}
	series := func(query string, pick func(*domain.PlatformDailyPoint) map[string]int) error {
		rows, err := s.db.QueryContext(ctx, query, since)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var tenantID, date string
			var count int
			if err := rows.Scan(&tenantID, &date, &count); err != nil {
				return err
			}
			if i, ok := dateIndex[date]; ok {
				if slug, ok := slugByID[tenantID]; ok {
					pick(&metrics.Daily[i])[slug] = count
				}
			}
		}
		return rows.Err()
	}
	if err := series(
		`SELECT tenant_id, substr(created_at, 1, 10) AS day, COUNT(*) FROM work_orders
		 WHERE substr(created_at, 1, 10) >= ? GROUP BY tenant_id, day`,
		func(p *domain.PlatformDailyPoint) map[string]int { return p.WorkOrders },
	); err != nil {
		return metrics, fmt.Errorf("work order series: %w", err)
	}
	if err := series(
		`SELECT tenant_id, substr(at, 1, 10) AS day, COUNT(*) FROM login_events
		 WHERE substr(at, 1, 10) >= ? GROUP BY tenant_id, day`,
		func(p *domain.PlatformDailyPoint) map[string]int { return p.Logins },
	); err != nil {
		return metrics, fmt.Errorf("login series: %w", err)
	}

	var pageCount, pageSize int64
	if err := s.db.QueryRowContext(ctx, `PRAGMA page_count`).Scan(&pageCount); err != nil {
		return metrics, fmt.Errorf("page count: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, `PRAGMA page_size`).Scan(&pageSize); err != nil {
		return metrics, fmt.Errorf("page size: %w", err)
	}
	metrics.Totals.DatabaseBytes = pageCount * pageSize

	for _, id := range order {
		tenant := *byID[id]
		metrics.Tenants = append(metrics.Tenants, tenant)
		metrics.Totals.Tenants++
		metrics.Totals.Users += tenant.Users
		metrics.Totals.Customers += tenant.Customers
		metrics.Totals.CatalogItems += tenant.CatalogItems
		metrics.Totals.WorkOrders += tenant.WorkOrders
		metrics.Totals.WorkOrdersInRange += tenant.WorkOrdersInRange
		metrics.Totals.OpenWorkOrders += tenant.OpenWorkOrders
		metrics.Totals.LoginsInRange += tenant.LoginsInRange
		metrics.Totals.ActiveUsersInRange += tenant.ActiveUsersInRange
		metrics.Totals.ActiveSessions += tenant.ActiveSessions
	}
	return metrics, nil
}

// mergeTenantMetrics folds one aggregate row into the tenant's totals. Work
// orders arrive one row per status, so counts add up; everything else is set
// by exactly one query.
func mergeTenantMetrics(target, row *domain.PlatformTenantMetrics) {
	target.Users += row.Users
	target.Admins += row.Admins
	target.Customers += row.Customers
	target.CatalogItems += row.CatalogItems
	target.WorkOrders += row.WorkOrders
	target.WorkOrdersInRange += row.WorkOrdersInRange
	target.OpenWorkOrders += row.OpenWorkOrders
	target.LoginsInRange += row.LoginsInRange
	target.ActiveUsersInRange += row.ActiveUsersInRange
	target.ActiveSessions += row.ActiveSessions
	target.HasLoginLogo = target.HasLoginLogo || row.HasLoginLogo
	for status, count := range row.StatusCounts {
		target.StatusCounts[status] += count
	}
	if row.LastWorkOrderAt != nil && (target.LastWorkOrderAt == nil || *row.LastWorkOrderAt > *target.LastWorkOrderAt) {
		target.LastWorkOrderAt = row.LastWorkOrderAt
	}
	if row.LastLoginAt != nil && (target.LastLoginAt == nil || *row.LastLoginAt > *target.LastLoginAt) {
		target.LastLoginAt = row.LastLoginAt
	}
}

const platformMigration = `
CREATE TABLE IF NOT EXISTS platform_admins (
	id TEXT PRIMARY KEY,
	username TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_sessions (
	token_hash TEXT PRIMARY KEY,
	admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_events_tenant_at ON login_events(tenant_id, at);
CREATE INDEX IF NOT EXISTS idx_login_events_at ON login_events(at);
`
