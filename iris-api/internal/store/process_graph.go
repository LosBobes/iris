package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Process templates and per-work-order process graphs. The queries below take
// a dbExecQuerier plus an explicit tenant id so the tenant-scoped store
// methods and the Backoffice (platform_processes.go) share validation and SQL.

// processGraphMigration adds tenant-defined process templates and the per-order
// copy of a template graph. Deleting a template keeps the orders' graphs
// (template_id becomes NULL); deleting an order or tenant removes its rows.
const processGraphMigration = `
CREATE TABLE IF NOT EXISTS process_templates (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	is_default INTEGER NOT NULL DEFAULT 0,
	graph TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (tenant_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_process_templates_default ON process_templates(tenant_id) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS work_order_processes (
	work_order_id TEXT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	template_id TEXT REFERENCES process_templates(id) ON DELETE SET NULL,
	template_name TEXT NOT NULL DEFAULT '',
	graph TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	updated_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_work_order_processes_tenant ON work_order_processes(tenant_id);
`

var (
	// ErrProcessTemplateNotFound means no template with that id exists in the tenant.
	ErrProcessTemplateNotFound = errors.New("process template not found")
	// ErrWorkOrderNotFound means no work order with that id exists in the tenant.
	ErrWorkOrderNotFound = errors.New("work order not found")
	// ErrProcessNotFound means the work order has no process attached.
	ErrProcessNotFound = errors.New("work order process not found")
	// ErrProcessExists means the work order already has a process.
	ErrProcessExists = errors.New("work order already has a process")
	// ErrProcessStructureLocked means a non-admin tried to change the process
	// structure rather than only its per-order state.
	ErrProcessStructureLocked = errors.New("process structure is admin-only")
	// ErrTenantNotFound means no organization has the requested slug.
	ErrTenantNotFound = errors.New("organization not found")
)

const duplicateProcessTemplateMessage = "Proces sa tim nazivom već postoji."

func newProcessTemplateID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create process template id: %w", err)
	}
	return "proc-" + hex.EncodeToString(raw[:]), nil
}

// graphValidationError turns a domain graph error into a store validation error.
func graphValidationError(err error) error {
	var graphErr *domain.ProcessGraphError
	if errors.As(err, &graphErr) {
		return newValidationError(graphErr.Message)
	}
	return err
}

// preparedProcessTemplate is a template input after trimming and validation.
type preparedProcessTemplate struct {
	name        string
	description string
	isDefault   bool
	graph       domain.ProcessGraph
}

func prepareProcessTemplateInput(input domain.ProcessTemplateInput) (preparedProcessTemplate, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return preparedProcessTemplate{}, newValidationError("Naziv procesa je obavezan.")
	}
	if utf8.RuneCountInString(name) > domain.MaxProcessNameLength {
		return preparedProcessTemplate{}, newValidationError("Naziv procesa je predugačak (najviše 120 znakova).")
	}
	graph, err := domain.PrepareTemplateGraph(input.Graph)
	if err != nil {
		return preparedProcessTemplate{}, graphValidationError(err)
	}
	return preparedProcessTemplate{
		name:        name,
		description: strings.TrimSpace(input.Description),
		isDefault:   input.IsDefault,
		graph:       graph,
	}, nil
}

func encodeProcessGraph(graph domain.ProcessGraph) (string, error) {
	raw, err := json.Marshal(graph)
	if err != nil {
		return "", fmt.Errorf("encode process graph: %w", err)
	}
	return string(raw), nil
}

func decodeProcessGraph(raw string) (domain.ProcessGraph, error) {
	var graph domain.ProcessGraph
	if err := json.Unmarshal([]byte(raw), &graph); err != nil {
		return domain.ProcessGraph{}, fmt.Errorf("decode process graph: %w", err)
	}
	return domain.CloneProcessGraph(graph), nil
}

const processTemplateColumns = `id, name, description, is_default, graph, created_at, updated_at`

func scanProcessTemplate(row interface{ Scan(...any) error }) (domain.ProcessTemplate, error) {
	var template domain.ProcessTemplate
	var graph string
	var isDefault int
	if err := row.Scan(&template.ID, &template.Name, &template.Description, &isDefault, &graph, &template.CreatedAt, &template.UpdatedAt); err != nil {
		return template, err
	}
	template.IsDefault = isDefault != 0
	var err error
	template.Graph, err = decodeProcessGraph(graph)
	return template, err
}

func listProcessTemplates(ctx context.Context, q dbExecQuerier, tenantID string) ([]domain.ProcessTemplate, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT `+processTemplateColumns+` FROM process_templates WHERE tenant_id = ?
		 ORDER BY is_default DESC, name COLLATE NOCASE`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list process templates: %w", err)
	}
	defer rows.Close()
	templates := make([]domain.ProcessTemplate, 0)
	for rows.Next() {
		template, err := scanProcessTemplate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan process template: %w", err)
		}
		templates = append(templates, template)
	}
	return templates, rows.Err()
}

// getProcessTemplate returns nil when the tenant has no template with that id.
func getProcessTemplate(ctx context.Context, q dbExecQuerier, tenantID, id string) (*domain.ProcessTemplate, error) {
	template, err := scanProcessTemplate(q.QueryRowContext(
		ctx,
		`SELECT `+processTemplateColumns+` FROM process_templates WHERE id = ? AND tenant_id = ?`,
		id, tenantID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load process template: %w", err)
	}
	return &template, nil
}

// clearOtherProcessDefaults keeps at most one default template per tenant.
func clearOtherProcessDefaults(ctx context.Context, q dbExecQuerier, tenantID, keepID string) error {
	if _, err := q.ExecContext(
		ctx,
		`UPDATE process_templates SET is_default = 0 WHERE tenant_id = ? AND id <> ? AND is_default = 1`,
		tenantID, keepID,
	); err != nil {
		return fmt.Errorf("clear default process template: %w", err)
	}
	return nil
}

// createProcessTemplate must run inside a transaction so default exclusivity
// is atomic with the insert.
func createProcessTemplate(ctx context.Context, q dbExecQuerier, tenantID string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	prepared, err := prepareProcessTemplateInput(input)
	if err != nil {
		return nil, err
	}
	if prepared.graph, err = resolveGraphLinks(ctx, q, tenantID, prepared.graph, nil); err != nil {
		return nil, err
	}
	id, err := newProcessTemplateID()
	if err != nil {
		return nil, err
	}
	graph, err := encodeProcessGraph(prepared.graph)
	if err != nil {
		return nil, err
	}
	if prepared.isDefault {
		if err := clearOtherProcessDefaults(ctx, q, tenantID, id); err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO process_templates(id, tenant_id, name, description, is_default, graph, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, tenantID, prepared.name, prepared.description, boolInt(prepared.isDefault), graph, now, now,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError(duplicateProcessTemplateMessage)
		}
		return nil, fmt.Errorf("create process template: %w", err)
	}
	return &domain.ProcessTemplate{
		ID: id, Name: prepared.name, Description: prepared.description, IsDefault: prepared.isDefault,
		Graph: prepared.graph, CreatedAt: now, UpdatedAt: now,
	}, nil
}

// updateProcessTemplate must run inside a transaction. It returns
// ErrProcessTemplateNotFound when the tenant has no such template.
func updateProcessTemplate(ctx context.Context, q dbExecQuerier, tenantID, id string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	prepared, err := prepareProcessTemplateInput(input)
	if err != nil {
		return nil, err
	}
	current, err := getProcessTemplate(ctx, q, tenantID, id)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, ErrProcessTemplateNotFound
	}
	if prepared.graph, err = resolveGraphLinks(ctx, q, tenantID, prepared.graph, existingLinkSkip(current.Graph)); err != nil {
		return nil, err
	}
	graph, err := encodeProcessGraph(prepared.graph)
	if err != nil {
		return nil, err
	}
	if prepared.isDefault {
		if err := clearOtherProcessDefaults(ctx, q, tenantID, id); err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := q.ExecContext(
		ctx,
		`UPDATE process_templates SET name = ?, description = ?, is_default = ?, graph = ?, updated_at = ?
		 WHERE id = ? AND tenant_id = ?`,
		prepared.name, prepared.description, boolInt(prepared.isDefault), graph, now, id, tenantID,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError(duplicateProcessTemplateMessage)
		}
		return nil, fmt.Errorf("update process template: %w", err)
	}
	return &domain.ProcessTemplate{
		ID: id, Name: prepared.name, Description: prepared.description, IsDefault: prepared.isDefault,
		Graph: prepared.graph, CreatedAt: current.CreatedAt, UpdatedAt: now,
	}, nil
}

// deleteProcessTemplate returns the deleted template's name, or
// ErrProcessTemplateNotFound. Work-order processes keep their graph.
func deleteProcessTemplate(ctx context.Context, q dbExecQuerier, tenantID, id string) (string, error) {
	current, err := getProcessTemplate(ctx, q, tenantID, id)
	if err != nil {
		return "", err
	}
	if current == nil {
		return "", ErrProcessTemplateNotFound
	}
	if _, err := q.ExecContext(ctx, `DELETE FROM process_templates WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return "", fmt.Errorf("delete process template: %w", err)
	}
	return current.Name, nil
}

// getWorkOrderProcess returns nil when the work order has no process (or does
// not exist in the tenant).
func getWorkOrderProcess(ctx context.Context, q dbExecQuerier, tenantID, workOrderID string) (*domain.WorkOrderProcess, error) {
	var process domain.WorkOrderProcess
	var templateID sql.NullString
	var graph string
	err := q.QueryRowContext(
		ctx,
		`SELECT work_order_id, template_id, template_name, graph, updated_at, updated_by
		 FROM work_order_processes WHERE work_order_id = ? AND tenant_id = ?`,
		workOrderID, tenantID,
	).Scan(&process.WorkOrderID, &templateID, &process.TemplateName, &graph, &process.UpdatedAt, &process.UpdatedBy)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load work order process: %w", err)
	}
	if templateID.Valid {
		process.TemplateID = &templateID.String
	}
	if process.Graph, err = decodeProcessGraph(graph); err != nil {
		return nil, err
	}
	return &process, nil
}

// insertWorkOrderProcess stores a fresh copy of a template graph on an order.
func insertWorkOrderProcess(ctx context.Context, q dbExecQuerier, tenantID, workOrderID string, template domain.ProcessTemplate, username, now string) (*domain.WorkOrderProcess, error) {
	graph := domain.InstantiateProcessGraph(template.Graph)
	raw, err := encodeProcessGraph(graph)
	if err != nil {
		return nil, err
	}
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO work_order_processes(work_order_id, tenant_id, template_id, template_name, graph, updated_at, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		workOrderID, tenantID, template.ID, template.Name, raw, now, username,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrProcessExists
		}
		return nil, fmt.Errorf("attach work order process: %w", err)
	}
	templateID := template.ID
	return &domain.WorkOrderProcess{
		WorkOrderID: workOrderID, TemplateID: &templateID, TemplateName: template.Name,
		Graph: graph, UpdatedAt: now, UpdatedBy: username,
	}, nil
}

// attachDefaultProcess copies the tenant's default template onto a freshly
// created work order. It does nothing when the tenant has no default.
func attachDefaultProcess(ctx context.Context, q dbExecQuerier, tenantID, workOrderID, username, now string) error {
	template, err := scanProcessTemplate(q.QueryRowContext(
		ctx,
		`SELECT `+processTemplateColumns+` FROM process_templates WHERE tenant_id = ? AND is_default = 1`,
		tenantID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load default process template: %w", err)
	}
	_, err = insertWorkOrderProcess(ctx, q, tenantID, workOrderID, template, username, now)
	return err
}

func workOrderExists(ctx context.Context, q dbExecQuerier, tenantID, workOrderID string) (bool, error) {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM work_orders WHERE id = ? AND tenant_id = ?`, workOrderID, tenantID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check work order: %w", err)
	}
	return true, nil
}

func (s *SQLiteStore) ProcessTemplates(ctx context.Context) ([]domain.ProcessTemplate, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return listProcessTemplates(ctx, s.db, tenantID)
}

// ProcessTemplateByID returns nil when the template does not exist.
func (s *SQLiteStore) ProcessTemplateByID(ctx context.Context, id string) (*domain.ProcessTemplate, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return getProcessTemplate(ctx, s.db, tenantID, id)
}

func (s *SQLiteStore) CreateProcessTemplate(ctx context.Context, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create process template: %w", err)
	}
	defer tx.Rollback()
	template, err := createProcessTemplate(ctx, tx, tenantID, input)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create process template: %w", err)
	}
	return template, nil
}

// UpdateProcessTemplate returns ErrProcessTemplateNotFound for an unknown id.
func (s *SQLiteStore) UpdateProcessTemplate(ctx context.Context, id string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update process template: %w", err)
	}
	defer tx.Rollback()
	template, err := updateProcessTemplate(ctx, tx, tenantID, id, input)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update process template: %w", err)
	}
	return template, nil
}

// DeleteProcessTemplate returns ErrProcessTemplateNotFound for an unknown id.
// Work orders keep their copy of the graph.
func (s *SQLiteStore) DeleteProcessTemplate(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	_, err = deleteProcessTemplate(ctx, s.db, tenantID, id)
	return err
}

// WorkOrderProcess returns nil when the order has no process or does not exist.
func (s *SQLiteStore) WorkOrderProcess(ctx context.Context, workOrderID string) (*domain.WorkOrderProcess, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return getWorkOrderProcess(ctx, s.db, tenantID, workOrderID)
}

// ApplyProcessTemplate copies a template onto a work order. It returns
// ErrWorkOrderNotFound, ErrProcessTemplateNotFound or ErrProcessExists.
func (s *SQLiteStore) ApplyProcessTemplate(ctx context.Context, workOrderID, templateID, username string) (*domain.WorkOrderProcess, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin apply process template: %w", err)
	}
	defer tx.Rollback()
	exists, err := workOrderExists(ctx, tx, tenantID, workOrderID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrWorkOrderNotFound
	}
	template, err := getProcessTemplate(ctx, tx, tenantID, templateID)
	if err != nil {
		return nil, err
	}
	if template == nil {
		return nil, ErrProcessTemplateNotFound
	}
	existing, err := getWorkOrderProcess(ctx, tx, tenantID, workOrderID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrProcessExists
	}
	now := time.Now().UTC().Format(time.RFC3339)
	process, err := insertWorkOrderProcess(ctx, tx, tenantID, workOrderID, *template, username, now)
	if err != nil {
		return nil, err
	}
	if err := postWorkOrderStock(ctx, tx, tenantID, workOrderID, process.Graph, username, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit apply process template: %w", err)
	}
	return process, nil
}

// UpdateWorkOrderProcess replaces the order's graph. It returns nil when the
// order has no process. Unless allowStructural is set, only per-order state
// and positions may change; anything else is ErrProcessStructureLocked.
func (s *SQLiteStore) UpdateWorkOrderProcess(ctx context.Context, workOrderID string, graph domain.ProcessGraph, username string, allowStructural bool) (*domain.WorkOrderProcess, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	next, err := domain.PrepareWorkOrderGraph(graph)
	if err != nil {
		return nil, graphValidationError(err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update work order process: %w", err)
	}
	defer tx.Rollback()
	current, err := getWorkOrderProcess(ctx, tx, tenantID, workOrderID)
	if err != nil || current == nil {
		return nil, err
	}
	if !allowStructural && domain.ProcessStructureChanged(current.Graph, next) {
		return nil, ErrProcessStructureLocked
	}
	if next, err = resolveGraphLinks(ctx, tx, tenantID, next, existingLinkSkip(current.Graph)); err != nil {
		return nil, err
	}
	raw, err := encodeProcessGraph(next)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE work_order_processes SET graph = ?, updated_at = ?, updated_by = ? WHERE work_order_id = ? AND tenant_id = ?`,
		raw, now, username, workOrderID, tenantID,
	); err != nil {
		return nil, fmt.Errorf("update work order process: %w", err)
	}
	if err := postWorkOrderStock(ctx, tx, tenantID, workOrderID, next, username, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update work order process: %w", err)
	}
	current.Graph, current.UpdatedAt, current.UpdatedBy = next, now, username
	return current, nil
}

// DeleteWorkOrderProcess returns ErrProcessNotFound when there is nothing to delete.
func (s *SQLiteStore) DeleteWorkOrderProcess(ctx context.Context, workOrderID string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM work_order_processes WHERE work_order_id = ? AND tenant_id = ?`, workOrderID, tenantID)
	if err != nil {
		return fmt.Errorf("delete work order process: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return ErrProcessNotFound
	}
	return nil
}
