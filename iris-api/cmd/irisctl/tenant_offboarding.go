package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

// cliActor is how irisctl appears in the Backoffice activity log.
var cliActor = store.AuditActor{AdminID: "irisctl", AdminUsername: "irisctl"}

// exportTenant writes the organization's full export to out (default
// iris-<slug>-<timestamp>.json), the same document the Backoffice downloads.
func exportTenant(ctx context.Context, dataStore *store.SQLStore, slug, out string) error {
	if strings.TrimSpace(slug) == "" {
		return fmt.Errorf("koristite -tenant <oznaka>")
	}
	export, err := dataStore.PlatformExportTenant(ctx, cliActor, slug)
	if err != nil {
		return err
	}
	if export == nil {
		return fmt.Errorf("organizacija %q ne postoji", slug)
	}
	if out == "" {
		out = fmt.Sprintf("iris-%s-%s.json", export.Tenant.Slug, time.Now().UTC().Format("20060102-150405"))
	}
	raw, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return fmt.Errorf("encode export: %w", err)
	}
	if err := os.WriteFile(out, append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("write export: %w", err)
	}
	fmt.Printf("Izvoz organizacije %s je sačuvan: %s (%d redova)\n", export.Tenant.Slug, out, export.TotalRows)
	return nil
}

// deleteTenant permanently deletes the organization once confirm repeats its
// slug. Like the Backoffice it only deletes a suspended organization; with
// suspend it suspends it first.
func deleteTenant(ctx context.Context, dataStore *store.SQLStore, slug, confirm string, suspend bool) error {
	if strings.TrimSpace(slug) == "" || strings.TrimSpace(confirm) == "" {
		return fmt.Errorf("koristite -tenant <oznaka> -confirm <oznaka>")
	}
	if suspend {
		tenant, err := dataStore.PlatformSetTenantSuspended(ctx, cliActor, slug, true)
		if err != nil {
			return err
		}
		if tenant == nil {
			return fmt.Errorf("organizacija %q ne postoji", slug)
		}
	}
	deletion, err := dataStore.PlatformDeleteTenant(ctx, cliActor, slug, confirm)
	if err != nil {
		return err
	}
	if deletion == nil {
		return fmt.Errorf("organizacija %q ne postoji", slug)
	}
	fmt.Printf("Organizacija %s (%s) je obrisana: %d redova.\n", deletion.Slug, deletion.Name, deletion.TotalRows)
	return nil
}
