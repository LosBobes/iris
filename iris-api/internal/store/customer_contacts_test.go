package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func strPtr(s string) *string { return &s }

func TestUpsertCustomerRoundTripsEmailsAndContacts(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))

	saved, err := sqliteStore.UpsertCustomer(ctx, domain.Customer{
		ID:   "cust-x",
		Name: "Firma X",
		Emails: []domain.CustomerEmail{
			{Email: "racun@firma.test", Label: strPtr("Računovodstvo")},
			{Email: "office@firma.test"},
			{Email: "  "}, // blank rows are dropped
		},
		Contacts: []domain.CustomerContact{
			{Name: "Ana", Email: strPtr("ana@firma.test"), Phone: strPtr("+381 11 1")},
			{Name: ""}, // nameless rows are dropped
		},
	})
	if err != nil {
		t.Fatalf("UpsertCustomer() error: %v", err)
	}
	if len(saved.Emails) != 2 {
		t.Fatalf("expected 2 emails, got %d", len(saved.Emails))
	}
	if saved.Emails[0].ID == "" || saved.Emails[0].SortOrder != 0 {
		t.Fatalf("expected generated id and sortOrder 0, got %+v", saved.Emails[0])
	}
	if len(saved.Contacts) != 1 || saved.Contacts[0].Name != "Ana" {
		t.Fatalf("expected 1 contact Ana, got %+v", saved.Contacts)
	}

	// Reload by ID and confirm persistence.
	loaded, err := sqliteStore.CustomerByID(ctx, "cust-x")
	if err != nil {
		t.Fatalf("CustomerByID() error: %v", err)
	}
	if len(loaded.Emails) != 2 || len(loaded.Contacts) != 1 {
		t.Fatalf("reload mismatch: emails=%d contacts=%d", len(loaded.Emails), len(loaded.Contacts))
	}
	if loaded.Emails[0].Label == nil || *loaded.Emails[0].Label != "Računovodstvo" {
		t.Fatalf("label not persisted: %+v", loaded.Emails[0])
	}

	// Upsert again with fewer children: replace-all semantics must drop the rest.
	if _, err := sqliteStore.UpsertCustomer(ctx, domain.Customer{
		ID:       "cust-x",
		Name:     "Firma X",
		Contacts: []domain.CustomerContact{{Name: "Marko"}},
	}); err != nil {
		t.Fatalf("second UpsertCustomer() error: %v", err)
	}
	reloaded, err := sqliteStore.CustomerByID(ctx, "cust-x")
	if err != nil {
		t.Fatalf("CustomerByID() error: %v", err)
	}
	if len(reloaded.Emails) != 0 {
		t.Fatalf("expected emails cleared, got %d", len(reloaded.Emails))
	}
	if len(reloaded.Contacts) != 1 || reloaded.Contacts[0].Name != "Marko" {
		t.Fatalf("expected only Marko, got %+v", reloaded.Contacts)
	}
}
