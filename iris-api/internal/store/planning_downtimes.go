package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Machine downtime windows (machine_downtimes, migration v33, D-028): dated
// intervals in which a machine unit is not available. The planner treats them
// as busy time; the API exposes them per machine. Times are local
// "YYYY-MM-DDTHH:MM" in the working-hours time zone, compared as text (the
// layout sorts chronologically).

// ErrMachineDowntimeNotFound means the machine has no downtime with that id.
var ErrMachineDowntimeNotFound = errors.New("machine downtime not found")

const (
	machineDowntimeTimeInvalid = "Početak i kraj zastoja moraju biti u obliku GGGG-MM-DDTHH:MM."
	machineDowntimeOrder       = "Početak zastoja mora biti pre njegovog kraja."
	machineDowntimeNoteTooLong = "Napomena zastoja je predugačka (najviše 500 znakova)."
)

// machineDowntimesMigration (v33, D-028) adds downtime windows per machine.
// Deleting a machine takes its windows along (the store deletes them
// explicitly; the cascade is a safety net).
const machineDowntimesMigration = `
CREATE TABLE IF NOT EXISTS machine_downtimes (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
	starts_at TEXT NOT NULL,
	ends_at TEXT NOT NULL,
	note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machine_downtimes_machine ON machine_downtimes(machine_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_machine_downtimes_tenant ON machine_downtimes(tenant_id, ends_at);
`

type preparedDowntime struct {
	from, to, note string
}

func prepareDowntimeInput(input domain.MachineDowntimeInput) (preparedDowntime, error) {
	from := strings.TrimSpace(input.From)
	to := strings.TrimSpace(input.To)
	if !validPlanningLocal(from) || !validPlanningLocal(to) {
		return preparedDowntime{}, newValidationError(machineDowntimeTimeInvalid)
	}
	if from >= to {
		return preparedDowntime{}, newValidationError(machineDowntimeOrder)
	}
	note := strings.TrimSpace(input.Note)
	if utf8.RuneCountInString(note) > domain.MaxMachineNoteLength {
		return preparedDowntime{}, newValidationError(machineDowntimeNoteTooLong)
	}
	return preparedDowntime{from: from, to: to, note: note}, nil
}

// validPlanningLocal accepts exactly "YYYY-MM-DDTHH:MM".
func validPlanningLocal(value string) bool {
	if len(value) != len(domain.PlanningLocalLayout) {
		return false
	}
	_, err := time.Parse(domain.PlanningLocalLayout, value)
	return err == nil
}

const downtimeColumns = `id, machine_id, starts_at, ends_at, note, created_at`

func scanDowntime(row interface{ Scan(...any) error }) (domain.MachineDowntime, error) {
	var d domain.MachineDowntime
	err := row.Scan(&d.ID, &d.MachineID, &d.From, &d.To, &d.Note, &d.CreatedAt)
	return d, err
}

// listMachineDowntimes returns the tenant's downtimes, of one machine when
// machineID is set, ordered by start then id.
func listMachineDowntimes(ctx context.Context, q dbExecQuerier, tenantID, machineID string) ([]domain.MachineDowntime, error) {
	query := `SELECT ` + downtimeColumns + ` FROM machine_downtimes WHERE tenant_id = ?`
	args := []any{tenantID}
	if machineID != "" {
		query += ` AND machine_id = ?`
		args = append(args, machineID)
	}
	rows, err := q.QueryContext(ctx, query+` ORDER BY starts_at, ends_at, id`, args...)
	if err != nil {
		return nil, fmt.Errorf("list machine downtimes: %w", err)
	}
	defer rows.Close()
	downtimes := make([]domain.MachineDowntime, 0)
	for rows.Next() {
		d, err := scanDowntime(rows)
		if err != nil {
			return nil, fmt.Errorf("scan machine downtime: %w", err)
		}
		downtimes = append(downtimes, d)
	}
	return downtimes, rows.Err()
}

func machineExists(ctx context.Context, q dbExecQuerier, tenantID, id string) (bool, error) {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM machines WHERE id = ? AND tenant_id = ?`, id, tenantID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check machine: %w", err)
	}
	return true, nil
}

// MachineDowntimes lists a machine's downtime windows. It returns
// ErrMachineNotFound for an unknown machine.
func (s *SQLiteStore) MachineDowntimes(ctx context.Context, machineID string) ([]domain.MachineDowntime, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	exists, err := machineExists(ctx, s.db, tenantID, machineID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrMachineNotFound
	}
	return listMachineDowntimes(ctx, s.db, tenantID, machineID)
}

// CreateMachineDowntime adds a window to a machine. It returns
// ErrMachineNotFound, or a validation error for malformed or reversed times
// and a long note.
func (s *SQLiteStore) CreateMachineDowntime(ctx context.Context, machineID string, input domain.MachineDowntimeInput) (*domain.MachineDowntime, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareDowntimeInput(input)
	if err != nil {
		return nil, err
	}
	exists, err := machineExists(ctx, s.db, tenantID, machineID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrMachineNotFound
	}
	id, err := newPlanningID("down")
	if err != nil {
		return nil, err
	}
	now := nowStamp()
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO machine_downtimes(id, tenant_id, machine_id, starts_at, ends_at, note, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, tenantID, machineID, prepared.from, prepared.to, prepared.note, now,
	); err != nil {
		return nil, fmt.Errorf("create machine downtime: %w", err)
	}
	return &domain.MachineDowntime{
		ID: id, MachineID: machineID, From: prepared.from, To: prepared.to, Note: prepared.note, CreatedAt: now,
	}, nil
}

// DeleteMachineDowntime removes one window. It returns ErrMachineNotFound for
// an unknown machine and ErrMachineDowntimeNotFound for an unknown window.
func (s *SQLiteStore) DeleteMachineDowntime(ctx context.Context, machineID, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	exists, err := machineExists(ctx, s.db, tenantID, machineID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrMachineNotFound
	}
	result, err := s.db.ExecContext(
		ctx, `DELETE FROM machine_downtimes WHERE id = ? AND machine_id = ? AND tenant_id = ?`, id, machineID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("delete machine downtime: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return ErrMachineDowntimeNotFound
	}
	return nil
}
