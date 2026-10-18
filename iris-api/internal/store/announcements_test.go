package store

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func announcementIDs(items []domain.Announcement) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

// scenarioAnnouncementsTargetAndWindow runs on both engines (see
// storeScenarios): targeting, the time window, ordering, end, delete and the
// audit trail.
func scenarioAnnouncementsTargetAndWindow(t *testing.T, ctx context.Context, s *SQLStore) {
	if err := s.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	actor := AuditActor{AdminID: "platform-1", AdminUsername: "ops", IP: "127.0.0.1"}
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	demoCtx := ContextWithTenant(context.Background(), DemoTenantID)
	otherCtx := ContextWithTenant(context.Background(), "tenant-other")

	everyone, err := s.PlatformCreateAnnouncement(ctx, actor, domain.PlatformAnnouncementInput{
		Message: "  Novi izveštaji su dostupni.  ", Severity: domain.AnnouncementInfo, AllTenants: true,
	}, now)
	if err != nil {
		t.Fatalf("create info: %v", err)
	}
	if everyone.Message != "Novi izveštaji su dostupni." || everyone.StartsAt != "2026-10-18T12:00:00Z" ||
		everyone.Status != domain.AnnouncementActive || everyone.EndsAt != nil || everyone.CreatedBy != "ops" {
		t.Fatalf("created = %+v", everyone)
	}
	onlyOther, err := s.PlatformCreateAnnouncement(ctx, actor, domain.PlatformAnnouncementInput{
		Message: "Održavanje u 22h", Severity: domain.AnnouncementMaintenance,
		StartsAt: strPtr("2026-10-18T13:00:00+02:00"), EndsAt: strPtr("2026-10-18T22:00:00Z"),
		TenantSlugs: []string{"OTHER", "other"},
	}, now)
	if err != nil {
		t.Fatalf("create targeted: %v", err)
	}
	if onlyOther.StartsAt != "2026-10-18T11:00:00Z" || len(onlyOther.Tenants) != 1 || onlyOther.Tenants[0].Slug != "other" {
		t.Fatalf("targeted = %+v", onlyOther)
	}
	scheduled, err := s.PlatformCreateAnnouncement(ctx, actor, domain.PlatformAnnouncementInput{
		Message: "Sutra", Severity: domain.AnnouncementWarning, StartsAt: strPtr("2026-10-19T08:00:00Z"), AllTenants: true,
	}, now)
	if err != nil {
		t.Fatalf("create scheduled: %v", err)
	}
	if scheduled.Status != domain.AnnouncementScheduled {
		t.Fatalf("scheduled status = %q", scheduled.Status)
	}

	demo, err := s.ActiveAnnouncements(demoCtx, now)
	if err != nil {
		t.Fatal(err)
	}
	if got := announcementIDs(demo); len(got) != 1 || got[0] != everyone.ID {
		t.Fatalf("demo active = %v", got)
	}
	other, err := s.ActiveAnnouncements(otherCtx, now)
	if err != nil {
		t.Fatal(err)
	}
	// Maintenance sorts first.
	if got := announcementIDs(other); len(got) != 2 || got[0] != onlyOther.ID || got[1] != everyone.ID {
		t.Fatalf("other active = %v", got)
	}
	if _, err := s.ActiveAnnouncements(context.Background(), now); !errors.Is(err, ErrNoTenant) {
		t.Fatalf("no tenant err = %v", err)
	}
	// Past its end, the targeted one disappears.
	later, err := s.ActiveAnnouncements(otherCtx, now.Add(11*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if got := announcementIDs(later); len(got) != 1 || got[0] != everyone.ID {
		t.Fatalf("other active later = %v", got)
	}

	// Retarget the info one to "other" only.
	updated, err := s.PlatformUpdateAnnouncement(ctx, actor, everyone.ID, domain.PlatformAnnouncementInput{
		Message: "Samo za other", Severity: domain.AnnouncementInfo, StartsAt: &everyone.StartsAt, TenantSlugs: []string{"other"},
	}, now)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.AllTenants || len(updated.Tenants) != 1 || updated.Message != "Samo za other" {
		t.Fatalf("updated = %+v", updated)
	}
	if demo, _ := s.ActiveAnnouncements(demoCtx, now); len(demo) != 0 {
		t.Fatalf("demo after retarget = %v", announcementIDs(demo))
	}

	// End: an active one ends now; a scheduled one collapses to now.
	ended, err := s.PlatformEndAnnouncement(ctx, actor, updated.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if ended.Status != domain.AnnouncementEnded || ended.EndsAt == nil || *ended.EndsAt != "2026-10-18T12:00:00Z" {
		t.Fatalf("ended = %+v", ended)
	}
	cancelled, err := s.PlatformEndAnnouncement(ctx, actor, scheduled.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if cancelled.Status != domain.AnnouncementEnded || cancelled.StartsAt != "2026-10-18T12:00:00Z" {
		t.Fatalf("cancelled = %+v", cancelled)
	}
	// Ending again is a no-op (no audit row).
	if _, err := s.PlatformEndAnnouncement(ctx, actor, scheduled.ID, now); err != nil {
		t.Fatal(err)
	}

	if err := s.PlatformDeleteAnnouncement(ctx, actor, onlyOther.ID, now); err != nil {
		t.Fatal(err)
	}
	if err := s.PlatformDeleteAnnouncement(ctx, actor, onlyOther.ID, now); !errors.Is(err, ErrAnnouncementNotFound) {
		t.Fatalf("delete twice err = %v", err)
	}
	if _, err := s.PlatformUpdateAnnouncement(ctx, actor, "ann-missing", domain.PlatformAnnouncementInput{Message: "x", Severity: "info", AllTenants: true}, now); !errors.Is(err, ErrAnnouncementNotFound) {
		t.Fatalf("update missing err = %v", err)
	}

	list, err := s.PlatformAnnouncements(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("list = %d items", len(list))
	}

	log, err := s.PlatformAuditLog(ctx, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	var actions []string
	for _, event := range log.Items {
		actions = append(actions, event.Action)
	}
	want := "announcement.delete,announcement.end,announcement.end,announcement.update,announcement.create,announcement.create,announcement.create"
	if got := strings.Join(actions, ","); got != want {
		t.Fatalf("audit = %s, want %s", got, want)
	}
	if detail := log.Items[3].Detail; detail["target"] != "other" || detail["severity"] != "info" || detail["announcementId"] != everyone.ID {
		t.Fatalf("update audit detail = %v", detail)
	}
}

func TestAnnouncementValidation(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, t.TempDir()+"/iris.db")
	defer s.Close()
	actor := AuditActor{AdminID: "platform-1", AdminUsername: "ops"}
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	for name, input := range map[string]domain.PlatformAnnouncementInput{
		"empty message":   {Message: "   ", Severity: "info", AllTenants: true},
		"too long":        {Message: strings.Repeat("ž", domain.MaxAnnouncementMessageLength+1), Severity: "info", AllTenants: true},
		"severity":        {Message: "x", Severity: "critical", AllTenants: true},
		"bad start":       {Message: "x", Severity: "info", StartsAt: strPtr("sutra"), AllTenants: true},
		"end before":      {Message: "x", Severity: "info", StartsAt: strPtr("2026-10-20T00:00:00Z"), EndsAt: strPtr("2026-10-19T00:00:00Z"), AllTenants: true},
		"end in the past": {Message: "x", Severity: "info", StartsAt: strPtr("2026-10-01T00:00:00Z"), EndsAt: strPtr("2026-10-02T00:00:00Z"), AllTenants: true},
		"no target":       {Message: "x", Severity: "info"},
		"unknown org":     {Message: "x", Severity: "info", TenantSlugs: []string{"nema"}},
	} {
		_, err := s.PlatformCreateAnnouncement(ctx, actor, input, now)
		var validation *ValidationError
		if !errors.As(err, &validation) {
			t.Errorf("%s: err = %v, want a validation error", name, err)
		}
	}
	// Exactly at the limit is fine.
	if _, err := s.PlatformCreateAnnouncement(ctx, actor, domain.PlatformAnnouncementInput{
		Message: strings.Repeat("ž", domain.MaxAnnouncementMessageLength), Severity: "warning", AllTenants: true,
	}, now); err != nil {
		t.Fatalf("max length: %v", err)
	}
}

// A deleted organization drops out of an announcement's targets.
func TestAnnouncementTargetsFollowTenantDeletion(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, t.TempDir()+"/iris.db")
	defer s.Close()
	if err := s.EnsureTenant(ctx, "tenant-gone", "gone", "Gone"); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	created, err := s.PlatformCreateAnnouncement(ctx, AuditActor{AdminID: "p", AdminUsername: "ops"}, domain.PlatformAnnouncementInput{
		Message: "x", Severity: "info", TenantSlugs: []string{"gone", DemoTenantSlug},
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Tenants) != 2 {
		t.Fatalf("tenants = %+v", created.Tenants)
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM tenants WHERE id = 'tenant-gone'`); err != nil {
		t.Fatal(err)
	}
	list, err := s.PlatformAnnouncements(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || len(list[0].Tenants) != 1 || list[0].Tenants[0].Slug != DemoTenantSlug {
		t.Fatalf("after delete = %+v", list)
	}
}
