package store

import (
	"context"
	"fmt"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Backoffice editing of an organization's process templates. The tenant-scoped
// queries are shared with process_graph.go; every mutation writes its
// platform_audit_events row in the same transaction.

func (s *SQLiteStore) platformTenant(ctx context.Context, slug string) (*domain.Tenant, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if tenant == nil {
		return nil, ErrTenantNotFound
	}
	return tenant, nil
}

func (s *SQLiteStore) PlatformProcessTemplates(ctx context.Context, slug string) ([]domain.ProcessTemplate, error) {
	tenant, err := s.platformTenant(ctx, slug)
	if err != nil {
		return nil, err
	}
	return listProcessTemplates(ctx, s.db, tenant.ID)
}

func (s *SQLiteStore) PlatformCreateProcessTemplate(ctx context.Context, actor AuditActor, slug string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	tenant, err := s.platformTenant(ctx, slug)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create process template: %w", err)
	}
	defer tx.Rollback()
	template, err := createProcessTemplate(ctx, tx, tenant.ID, input)
	if err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditProcessTemplateCreate,
		tenant: tenant,
		detail: map[string]string{"name": template.Name},
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create process template: %w", err)
	}
	return template, nil
}

func (s *SQLiteStore) PlatformUpdateProcessTemplate(ctx context.Context, actor AuditActor, slug, id string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	tenant, err := s.platformTenant(ctx, slug)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update process template: %w", err)
	}
	defer tx.Rollback()
	template, err := updateProcessTemplate(ctx, tx, tenant.ID, id, input)
	if err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditProcessTemplateUpdate,
		tenant: tenant,
		detail: map[string]string{"name": template.Name},
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update process template: %w", err)
	}
	return template, nil
}

func (s *SQLiteStore) PlatformDeleteProcessTemplate(ctx context.Context, actor AuditActor, slug, id string) error {
	tenant, err := s.platformTenant(ctx, slug)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete process template: %w", err)
	}
	defer tx.Rollback()
	name, err := deleteProcessTemplate(ctx, tx, tenant.ID, id)
	if err != nil {
		return err
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditProcessTemplateDelete,
		tenant: tenant,
		detail: map[string]string{"name": name},
	}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete process template: %w", err)
	}
	return nil
}
