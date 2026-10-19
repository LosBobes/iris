package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Optional per-organization modules ("processes", "stock", "planning" and
// "attendance"). All
// are off by default and only Backoffice superadmins switch them. The flags live in the
// app_settings key/value table (no migration); a missing row or key means off.
//
// Stock posting safety (migration v22): a work-order process is "stock tracked"
// only when it was created while the stock module was on. Untracked processes
// never post movements and never reserve stock, so switching stock on later
// causes no retroactive consumption. Turning stock off and on again resumes
// tracked processes; their next save posts the difference.

const modulesSettingKey = "modules"

// workOrderProcessStockTrackedMigration (v22) adds the stock-tracked marker.
const workOrderProcessStockTrackedMigration = `
ALTER TABLE work_order_processes ADD COLUMN stock_tracked INTEGER NOT NULL DEFAULT 0;
`

// parseModules decodes the stored JSON; anything unreadable means all off.
// Attendance was part of planning before it became its own module (D-027), so
// a stored value without the "attendance" key keeps it on wherever planning is.
func parseModules(raw string) domain.OrganizationModules {
	var stored struct {
		domain.OrganizationModules
		Attendance *bool `json:"attendance"`
	}
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return domain.OrganizationModules{}
	}
	modules := stored.OrganizationModules
	if stored.Attendance != nil {
		modules.Attendance = *stored.Attendance
	} else {
		modules.Attendance = modules.Planning
	}
	return effectiveModules(modules)
}

// ModulesDependencyMessage is the 422 for switching "processes" on without
// "stock": the process module needs the warehouse.
const ModulesDependencyMessage = "Modul „Procesi rada“ zahteva uključen modul „Magacin“."

// ModulesPlanningDependencyMessage is the 422 for switching "planning" on
// without "processes": the planner schedules process steps.
const ModulesPlanningDependencyMessage = "Modul „Planiranje“ zahteva uključen modul „Procesi rada“."

// ModulesPlanningAttendanceMessage is the 422 for switching "planning" on
// without "attendance": the planner only assigns workers who are present.
const ModulesPlanningAttendanceMessage = "Modul „Planiranje“ zahteva uključen modul „Prisustvo“."

// effectiveModules applies the dependencies on read: processes only count
// while stock is on, and planning only while processes and attendance are,
// even if stored data says otherwise.
func effectiveModules(modules domain.OrganizationModules) domain.OrganizationModules {
	modules.Processes = modules.Processes && modules.Stock
	modules.Planning = modules.Planning && modules.Processes && modules.Attendance
	return modules
}

func validateModules(modules domain.OrganizationModules) error {
	if modules.Processes && !modules.Stock {
		return newValidationError(ModulesDependencyMessage)
	}
	if modules.Planning && !modules.Processes {
		return newValidationError(ModulesPlanningDependencyMessage)
	}
	if modules.Planning && !modules.Attendance {
		return newValidationError(ModulesPlanningAttendanceMessage)
	}
	return nil
}

// readModules loads one organization's modules through any query handle (the
// pool or a transaction).
func readModules(ctx context.Context, q dbExecQuerier, tenantID string) (domain.OrganizationModules, error) {
	var raw string
	err := q.QueryRowContext(
		ctx,
		`SELECT value FROM app_settings WHERE tenant_id = ? AND key = ?`,
		tenantID, modulesSettingKey,
	).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.OrganizationModules{}, nil
	}
	if err != nil {
		return domain.OrganizationModules{}, fmt.Errorf("load organization modules: %w", err)
	}
	return parseModules(raw), nil
}

func writeModules(ctx context.Context, q dbExecQuerier, tenantID string, modules domain.OrganizationModules) error {
	raw, err := json.Marshal(modules)
	if err != nil {
		return fmt.Errorf("encode organization modules: %w", err)
	}
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO app_settings(tenant_id, key, value) VALUES (?, ?, ?)
		 ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value`,
		tenantID, modulesSettingKey, string(raw),
	); err != nil {
		return fmt.Errorf("update organization modules: %w", err)
	}
	return nil
}

func onOff(value bool) string {
	if value {
		return "on"
	}
	return "off"
}

// moduleChangeDetail builds the audit detail of a module switch and reports
// whether anything changed. "processes"/"stock"/"planning"/"attendance" carry the new values and
// "changed" the comma-joined names that differ.
func moduleChangeDetail(current, next domain.OrganizationModules) (map[string]string, bool) {
	changed := []string{}
	if current.Processes != next.Processes {
		changed = append(changed, "processes")
	}
	if current.Stock != next.Stock {
		changed = append(changed, "stock")
	}
	if current.Planning != next.Planning {
		changed = append(changed, "planning")
	}
	if current.Attendance != next.Attendance {
		changed = append(changed, "attendance")
	}
	sort.Strings(changed)
	return map[string]string{
		"processes":  onOff(next.Processes),
		"stock":      onOff(next.Stock),
		"planning":   onOff(next.Planning),
		"attendance": onOff(next.Attendance),
		"changed":    strings.Join(changed, ","),
	}, len(changed) > 0
}

// OrganizationModules returns the modules of the tenant in ctx.
func (s *SQLiteStore) OrganizationModules(ctx context.Context) (domain.OrganizationModules, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.OrganizationModules{}, err
	}
	return readModules(ctx, s.db, tenantID)
}

// PlatformSetTenantModules sets all modules of the organization with that slug
// and writes a "tenant.modules" audit row in the same transaction. It returns
// nil when no organization has that slug; switching to the current state
// changes nothing and writes no audit row.
func (s *SQLiteStore) PlatformSetTenantModules(ctx context.Context, actor AuditActor, slug string, modules domain.OrganizationModules) (*domain.PlatformTenant, error) {
	if err := validateModules(modules); err != nil {
		return nil, err
	}
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin set tenant modules: %w", err)
	}
	defer tx.Rollback()
	current, err := readModules(ctx, tx, tenant.ID)
	if err != nil {
		return nil, err
	}
	detail, changed := moduleChangeDetail(current, modules)
	if changed {
		if err := writeModules(ctx, tx, tenant.ID, modules); err != nil {
			return nil, err
		}
		if err := writeAudit(ctx, tx, actor, auditEntry{action: domain.AuditTenantModules, tenant: tenant, detail: detail}); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit set tenant modules: %w", err)
	}
	s.invalidateSettings(tenant.ID)
	return s.platformTenantByID(ctx, tenant.ID)
}

// SetTenantModules is the operator-CLI switch (irisctl set-modules): nil fields
// stay as they are and, unlike PlatformSetTenantModules, no audit row is
// written because there is no platform admin acting. It returns nil when no
// organization has that slug.
func (s *SQLiteStore) SetTenantModules(ctx context.Context, slug string, update domain.OrganizationModulesUpdate) (*domain.OrganizationModules, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	modules, err := readModules(ctx, s.db, tenant.ID)
	if err != nil {
		return nil, err
	}
	if update.Processes != nil {
		modules.Processes = *update.Processes
	}
	if update.Stock != nil {
		modules.Stock = *update.Stock
	}
	if update.Planning != nil {
		modules.Planning = *update.Planning
	}
	if update.Attendance != nil {
		modules.Attendance = *update.Attendance
	}
	if err := validateModules(modules); err != nil {
		return nil, err
	}
	if err := writeModules(ctx, s.db, tenant.ID, modules); err != nil {
		return nil, err
	}
	s.invalidateSettings(tenant.ID)
	return &modules, nil
}

// OrganizationModules returns the fixture shop's modules (off by default).
func (s *FixtureStore) OrganizationModules(_ context.Context) (domain.OrganizationModules, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.modules, nil
}

// SetOrganizationModules switches the fixture shop's modules (tests, seed).
func (s *FixtureStore) SetOrganizationModules(modules domain.OrganizationModules) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.modules = effectiveModules(modules)
}
