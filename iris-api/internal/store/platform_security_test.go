package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/pquerna/otp/totp"
)

func TestPlatformAdminDisableKeepsOneActive(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	// The seeded default "admin" is the only account; an outside actor (no
	// account of its own, like irisctl) still cannot disable it.
	actor := AuditActor{AdminUsername: "irisctl"}
	admins, err := s.PlatformAdmins(ctx)
	if err != nil || len(admins) != 1 {
		t.Fatalf("admins = %+v, %v", admins, err)
	}
	var validation *ValidationError
	if _, err := s.PlatformSetAdminDisabled(ctx, actor, admins[0].ID, true); !errors.As(err, &validation) {
		t.Fatalf("disable last admin err = %v, want validation error", err)
	}
	second, err := s.PlatformCreateAdmin(ctx, actor, domain.PlatformCreateAdminInput{Username: "ops", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.PlatformSetAdminDisabled(ctx, actor, admins[0].ID, true); err != nil || got.DisabledAt == nil {
		t.Fatalf("disable = %+v, %v", got, err)
	}
	if _, err := s.PlatformSetAdminDisabled(ctx, actor, second.ID, true); !errors.As(err, &validation) {
		t.Fatalf("disable the now-last admin err = %v, want validation error", err)
	}
	if admin, _ := s.AuthenticatePlatformAdmin(ctx, DefaultPlatformAdminUsername, DefaultPlatformAdminPassword); admin != nil {
		t.Fatal("disabled admin authenticated")
	}
}

func TestPlatformTOTPResetAndHashedRecoveryCodes(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err := s.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	admin, _ := s.AuthenticatePlatformAdmin(ctx, "ops", "correct-horse-battery")
	key, err := totp.Generate(totp.GenerateOpts{Issuer: TOTPIssuer, AccountName: "ops"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetPlatformTOTPPending(ctx, admin.ID, key.Secret()); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	code, _ := totp.GenerateCode(key.Secret(), now)
	actor := AuditActor{AdminID: admin.ID, AdminUsername: "ops"}
	codes, err := s.EnablePlatformTOTP(ctx, actor, code, now)
	if err != nil || len(codes) != RecoveryCodeCount {
		t.Fatalf("enable = %v, %v", codes, err)
	}
	// Only hashes are kept.
	var stored int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_recovery_codes WHERE code_hash = ?`, codes[0]).Scan(&stored); err != nil || stored != 0 {
		t.Fatalf("plain recovery code stored (%d, %v)", stored, err)
	}
	if remaining, _ := s.RemainingRecoveryCodes(ctx, admin.ID); remaining != RecoveryCodeCount {
		t.Fatalf("remaining = %d", remaining)
	}
	session, _ := s.CreatePlatformSession(ctx, admin.ID, now.Add(time.Hour))

	if err := s.ResetPlatformAdminTOTP(ctx, AuditActor{AdminUsername: "irisctl"}, "nobody"); !errors.Is(err, ErrPlatformAdminNotFound) {
		t.Fatalf("reset unknown = %v", err)
	}
	if err := s.ResetPlatformAdminTOTP(ctx, AuditActor{AdminUsername: "irisctl"}, "ops"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.AuthenticatePlatformAdmin(ctx, "ops", "correct-horse-battery"); got == nil || got.TwoFactorEnabled {
		t.Fatalf("after reset = %+v", got)
	}
	if got, _ := s.PlatformAdminBySession(ctx, session); got != nil {
		t.Fatal("session survived the reset")
	}
	if remaining, _ := s.RemainingRecoveryCodes(ctx, admin.ID); remaining != 0 {
		t.Fatalf("recovery codes after reset = %d", remaining)
	}
	log, err := s.PlatformAuditLog(ctx, 10, 0)
	if err != nil || len(log.Items) != 2 || log.Items[0].Action != domain.AuditAdminTwoFactorReset ||
		log.Items[0].AdminUsername != "irisctl" || log.Items[0].TargetUsername != "ops" {
		t.Fatalf("audit = %+v, %v", log.Items, err)
	}
}
