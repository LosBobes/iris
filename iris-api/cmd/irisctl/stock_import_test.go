package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestParseStockCSVCommaDelimited(t *testing.T) {
	lines, err := parseStockCSV([]byte("code,quantity,note\nPAP-1,100,glavni magacin\n BOJ-1 ,\"2,5\",\n\nPLO-1,4\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 3 {
		t.Fatalf("lines = %+v", lines)
	}
	if lines[0].Code != "PAP-1" || lines[0].Quantity != 100 || lines[0].Note != "glavni magacin" || lines[0].Row != 2 {
		t.Fatalf("line 0 = %+v", lines[0])
	}
	if lines[1].Code != "BOJ-1" || lines[1].Quantity != 2.5 {
		t.Fatalf("decimal comma (quoted) = %+v", lines[1])
	}
	if lines[2].Code != "PLO-1" || lines[2].Quantity != 4 || lines[2].Row != 5 {
		t.Fatalf("short row = %+v", lines[2])
	}
}

func TestParseStockCSVSemicolonAndDecimalComma(t *testing.T) {
	lines, err := parseStockCSV([]byte("\xef\xbb\xbfCode;Quantity;Note\r\nPAP-1;1.250,5;x\r\nBOJ-1;2,75;\r\nPLO-1;0;\r\n"))
	if err != nil {
		t.Fatal(err)
	}
	want := []float64{1250.5, 2.75, 0}
	if len(lines) != len(want) {
		t.Fatalf("lines = %+v", lines)
	}
	for i, quantity := range want {
		if lines[i].Quantity != quantity {
			t.Errorf("line %d quantity = %v, want %v", i, lines[i].Quantity, quantity)
		}
	}
}

func TestParseStockCSVRejectsBadInput(t *testing.T) {
	cases := map[string]string{
		"no quantity column": "code,qty\nA,1\n",
		"no header":          "",
		"not a number":       "code,quantity\nA,abc\n",
		"negative":           "code,quantity\nA,-1\n",
		"missing quantity":   "code,quantity\nA,\n",
		"duplicate code":     "code,quantity\nA,1\na,2\n",
		"missing code":       "code,quantity\n,5\n",
	}
	for name, content := range cases {
		if _, err := parseStockCSV([]byte(content)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestParseStockQuantity(t *testing.T) {
	for input, want := range map[string]float64{"3": 3, "3.5": 3.5, "3,5": 3.5, "1 000": 1000, "1,000.5": 1000.5, "1.000,5": 1000.5, "0": 0} {
		got, err := parseStockQuantity(input)
		if err != nil || got != want {
			t.Errorf("%q = %v, %v; want %v", input, got, err, want)
		}
	}
	for _, input := range []string{"", "1,2,3", "x", "-2", "NaN", "Inf"} {
		if _, err := parseStockQuantity(input); err == nil {
			t.Errorf("%q: expected an error", input)
		}
	}
}

func TestImportStockDryRunAndApply(t *testing.T) {
	ctx := context.Background()
	sqliteStore, err := store.OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqliteStore.Close() })
	if err := sqliteStore.EnsureTenant(ctx, "tenant-t", "t", "T"); err != nil {
		t.Fatal(err)
	}
	ctx = store.ContextWithTenant(ctx, "tenant-t")
	for _, item := range []domain.CatalogItem{
		{ID: "a-paper", Code: "PAP-1", Name: "Papir", Unit: "tabak", Kind: domain.CatalogItemKindArticle, IsActive: true},
		{ID: "a-ink", Code: "BOJ-1", Name: "Boja", Unit: "kg", Kind: domain.CatalogItemKindArticle, IsActive: true},
		{ID: "s-svc", Code: "USL-1", Name: "Usluga", Unit: "kom", Kind: domain.CatalogItemKindService, IsActive: true},
	} {
		if _, err := sqliteStore.UpsertCatalogItem(ctx, item, ""); err != nil {
			t.Fatal(err)
		}
	}
	path := filepath.Join(t.TempDir(), "stock.csv")
	if err := os.WriteFile(path, []byte("code;quantity;note\npap-1;1.250,5;prebrojano\nBOJ-1;2,5;\nUSL-1;1;\nNEMA-1;9;\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	report, err := importStock(ctx, sqliteStore, path, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(report, "NEPOZNATA ŠIFRA: NEMA-1") || !strings.Contains(report, "NEPOZNATA ŠIFRA: USL-1") || !strings.Contains(report, "Dry-run") {
		t.Fatalf("dry-run report:\n%s", report)
	}
	if moves, _ := sqliteStore.StockMovements(ctx, store.StockMovementQuery{}); moves.Total != 0 {
		t.Fatalf("dry-run posted %d movements", moves.Total)
	}

	report, err = importStock(ctx, sqliteStore, path, true)
	if err != nil || !strings.Contains(report, "Upisano kretanja: 2.") {
		t.Fatalf("apply report = %q, %v", report, err)
	}
	moves, _ := sqliteStore.StockMovements(ctx, store.StockMovementQuery{})
	if moves.Total != 2 {
		t.Fatalf("movements = %+v", moves)
	}
	for _, m := range moves.Items {
		if m.Kind != domain.StockMovementOpening || m.CreatedBy != "irisctl" {
			t.Fatalf("movement = %+v", m)
		}
	}
	paper, _ := sqliteStore.CatalogItemByID(ctx, "a-paper")
	if paper.StockOnHand == nil || *paper.StockOnHand != 1250.5 {
		t.Fatalf("paper on hand = %v", paper.StockOnHand)
	}

	// A second apply of the same file is a no-op; a changed count is an adjustment.
	if report, err = importStock(ctx, sqliteStore, path, true); err != nil || !strings.Contains(report, "Upisano kretanja: 0.") {
		t.Fatalf("repeat apply = %q, %v", report, err)
	}
	if err := os.WriteFile(path, []byte("code,quantity\nPAP-1,1000\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := importStock(ctx, sqliteStore, path, true); err != nil {
		t.Fatal(err)
	}
	last, _ := sqliteStore.StockMovements(ctx, store.StockMovementQuery{CatalogItemID: "a-paper", Limit: 1})
	if last.Items[0].Kind != domain.StockMovementAdjustment || last.Items[0].Quantity != -250.5 {
		t.Fatalf("adjustment = %+v", last.Items[0])
	}
}
