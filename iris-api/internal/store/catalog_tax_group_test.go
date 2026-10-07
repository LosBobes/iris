package store

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func sptr(value string) *string { return &value }

func taxGroupOf(t *testing.T, item *domain.CatalogItem) string {
	t.Helper()
	if item.TaxGroup == nil {
		t.Fatalf("item %s taxGroup = nil", item.ID)
	}
	return *item.TaxGroup
}

// An item saved without a PDV type gets the general-rate default; an explicit
// type and a legacy code are kept, and the fiscal spelling Đ folds into DJ.
func TestUpsertCatalogItemDefaultsTaxGroup(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	cases := []struct {
		id   string
		in   *string
		want string
	}{
		{"tg-nil", nil, domain.DefaultTaxGroup},
		{"tg-blank", sptr("  "), domain.DefaultTaxGroup},
		{"tg-fiscal", sptr("Đ"), domain.DefaultTaxGroup},
		{"tg-special", sptr("E"), "E"},
		{"tg-legacy", sptr(" 3 "), "3"},
	}
	for _, tc := range cases {
		item := baseCatalogItem(tc.id, 100, 200)
		item.TaxGroup = tc.in
		saved := upsertCatalog(t, ctx, s, item, "")
		if got := taxGroupOf(t, saved); got != tc.want {
			t.Errorf("%s: saved taxGroup = %q, want %q", tc.id, got, tc.want)
		}
		read, err := s.CatalogItemByID(ctx, tc.id)
		if err != nil || read == nil {
			t.Fatalf("CatalogItemByID(%s): %v", tc.id, err)
		}
		if got := taxGroupOf(t, read); got != tc.want {
			t.Errorf("%s: stored taxGroup = %q, want %q", tc.id, got, tc.want)
		}
	}
}

// The backfill migration sets DJ on items stored with no PDV type (or as Đ)
// and leaves explicit and legacy codes alone.
func TestCatalogDefaultTaxGroupMigrationBackfills(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	for _, id := range []string{"mg-null", "mg-blank", "mg-fiscal", "mg-special", "mg-legacy"} {
		upsertCatalog(t, ctx, s, baseCatalogItem(id, 100, 200), "")
	}
	// Simulate pre-migration rows written before the store defaulted the field.
	raw := map[string]any{
		"mg-null":    nil,
		"mg-blank":   "",
		"mg-fiscal":  "Đ",
		"mg-special": "E",
		"mg-legacy":  "7",
	}
	for id, value := range raw {
		if _, err := s.db.ExecContext(ctx, `UPDATE catalog_items SET tax_group = ? WHERE id = ?`, value, id); err != nil {
			t.Fatalf("reset %s: %v", id, err)
		}
	}

	if _, err := s.db.ExecContext(ctx, catalogDefaultTaxGroupMigration); err != nil {
		t.Fatalf("run migration: %v", err)
	}

	want := map[string]string{
		"mg-null":    domain.DefaultTaxGroup,
		"mg-blank":   domain.DefaultTaxGroup,
		"mg-fiscal":  domain.DefaultTaxGroup,
		"mg-special": "E",
		"mg-legacy":  "7",
	}
	for id, expected := range want {
		var got string
		if err := s.db.QueryRowContext(ctx, `SELECT tax_group FROM catalog_items WHERE id = ?`, id).Scan(&got); err != nil {
			t.Fatalf("read %s: %v", id, err)
		}
		if got != expected {
			t.Errorf("%s: tax_group = %q, want %q", id, got, expected)
		}
	}
}
