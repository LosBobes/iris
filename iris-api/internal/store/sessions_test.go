package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestAuthenticateUnknownUserStillRunsBcrypt(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if err := sqliteStore.CreateUser(ctx, "u-1", "admin", "sifra123", domain.RoleAdmin, false); err != nil {
		t.Fatal(err)
	}

	// Best of three, to keep scheduler noise out: an unknown username must cost
	// about as much as a wrong password (one bcrypt comparison), not return at
	// once.
	fastest := func(username string) time.Duration {
		best := time.Hour
		for i := 0; i < 3; i++ {
			start := time.Now()
			user, err := sqliteStore.AuthenticateUser(ctx, DemoTenantID, username, "pogresna")
			elapsed := time.Since(start)
			if err != nil || user != nil {
				t.Fatalf("AuthenticateUser(%s) = %v, %v; want nil, nil", username, user, err)
			}
			best = min(best, elapsed)
		}
		return best
	}
	known := fastest("admin")
	unknown := fastest("nepostojeci")
	if unknown < known/4 {
		t.Fatalf("unknown user took %v against %v for a wrong password; the dummy bcrypt comparison is missing", unknown, known)
	}
}

func TestEndUserSessionsKeepsOnlyTheExceptedSession(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	for _, id := range []string{"u-1", "u-2"} {
		if err := sqliteStore.CreateUser(ctx, id, id, "sifra123", domain.RoleUser, false); err != nil {
			t.Fatal(err)
		}
	}
	in := time.Now().Add(time.Hour)
	keep, _ := sqliteStore.CreateSession(ctx, "u-1", in)
	other, _ := sqliteStore.CreateSession(ctx, "u-1", in)
	bystander, _ := sqliteStore.CreateSession(ctx, "u-2", in)

	if err := sqliteStore.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	var adminID string
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT id FROM platform_admins WHERE username = 'ops'`).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	impersonation, _, err := sqliteStore.CreateImpersonationSession(ctx, ImpersonationInput{
		AdminID: adminID, AdminUsername: "ops", TenantID: DemoTenantID, UserID: "u-1", ExpiresAt: in,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := sqliteStore.EndUserSessions(ctx, "u-1", keep); err != nil {
		t.Fatal(err)
	}
	for token, want := range map[string]bool{keep: true, other: false, impersonation: false, bystander: true} {
		user, err := sqliteStore.UserBySessionToken(ctx, token)
		if err != nil || (user != nil) != want {
			t.Fatalf("session alive = %v (%v), want %v", user != nil, err, want)
		}
	}
	var open int
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_events WHERE ended_at IS NULL`).Scan(&open); err != nil || open != 0 {
		t.Fatalf("open impersonations = %d (%v), want the ended one closed", open, err)
	}
	// Another tenant's context ends nothing here.
	if err := sqliteStore.EndUserSessions(ContextWithTenant(context.Background(), "tenant-x"), "u-1", ""); err != nil {
		t.Fatal(err)
	}
	if user, _ := sqliteStore.UserBySessionToken(ctx, keep); user == nil {
		t.Fatal("another tenant's context ended a session")
	}
}

func TestExtendSessionNeverPassesTheCap(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if err := sqliteStore.CreateUser(ctx, "u-1", "u-1", "sifra123", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	token, err := sqliteStore.StartSession(ctx, NewSession{UserID: "u-1", ExpiresAt: now.Add(time.Hour), AbsoluteExpiresAt: now.Add(2 * time.Hour), Remember: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := sqliteStore.ExtendSession(ctx, token, now.Add(5*time.Hour)); err != nil {
		t.Fatal(err)
	}
	session, err := sqliteStore.SessionByToken(ctx, token)
	if err != nil || session == nil {
		t.Fatalf("session = %v, %v", session, err)
	}
	if !session.ExpiresAt.Equal(now.Add(2*time.Hour)) || !session.Remember {
		t.Fatalf("session = %+v, want expiry clamped to the cap", session)
	}
	// Never backwards.
	if err := sqliteStore.ExtendSession(ctx, token, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if session, _ := sqliteStore.SessionByToken(ctx, token); !session.ExpiresAt.Equal(now.Add(2 * time.Hour)) {
		t.Fatalf("expiry moved back to %v", session.ExpiresAt)
	}
}

// TestSessionTokenHashMigration replays v25 on a database holding sessions in
// the old shape: they are ended (raw tokens cannot be matched any more), open
// impersonations are closed in the log, and the new columns appear.
func TestSessionTokenHashMigration(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if err := sqliteStore.CreateUser(ctx, "u-1", "u-1", "sifra123", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	if err := sqliteStore.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	var adminID string
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT id FROM platform_admins WHERE username = 'ops'`).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := sqliteStore.CreateImpersonationSession(ctx, ImpersonationInput{
		AdminID: adminID, AdminUsername: "ops", TenantID: DemoTenantID, UserID: "u-1", ExpiresAt: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}

	// Back to the pre-v25 shape, with a plaintext session in it.
	for _, statement := range []string{
		`DROP INDEX idx_sessions_user_id`,
		`ALTER TABLE sessions DROP COLUMN remember`,
		`ALTER TABLE sessions DROP COLUMN absolute_expires_at`,
		`ALTER TABLE sessions RENAME COLUMN token_hash TO token`,
		`DELETE FROM schema_migrations WHERE version = 25`,
	} {
		if _, err := sqliteStore.db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("%s: %v", statement, err)
		}
	}
	if _, err := sqliteStore.db.ExecContext(ctx,
		`INSERT INTO sessions(token, user_id, expires_at) VALUES ('plain-token', 'u-1', ?)`,
		time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
	); err != nil {
		t.Fatal(err)
	}

	if err := RunMigrations(ctx, sqliteStore.db); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	var sessions, open, applied int
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions`).Scan(&sessions); err != nil || sessions != 0 {
		t.Fatalf("sessions after migration = %d (%v), want 0", sessions, err)
	}
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_events WHERE ended_at IS NULL`).Scan(&open); err != nil || open != 0 {
		t.Fatalf("open impersonations = %d (%v), want 0", open, err)
	}
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = 25`).Scan(&applied); err != nil || applied != 1 {
		t.Fatalf("v25 recorded %d times (%v)", applied, err)
	}
	token, err := sqliteStore.StartSession(ctx, NewSession{UserID: "u-1", ExpiresAt: time.Now().Add(time.Hour), Remember: true})
	if err != nil {
		t.Fatal(err)
	}
	if session, err := sqliteStore.SessionByToken(ctx, token); err != nil || session == nil || !session.Remember {
		t.Fatalf("session after migration = %+v, %v", session, err)
	}
}
