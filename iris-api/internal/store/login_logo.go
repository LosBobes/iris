package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const loginLogoSettingKey = "login_logo"

// MaxLoginLogoBytes caps the decoded image. Base64 inflates it by a third, which
// keeps the upload comfortably inside the API's 1 MiB JSON body limit; a logo
// for a sign-in screen never needs more.
const MaxLoginLogoBytes = 512 << 10

// allowedLoginLogoTypes are the formats accepted for upload. SVG is excluded on
// purpose: it is served from the API origin, and an SVG opened directly (not
// through <img>) runs its scripts there.
var allowedLoginLogoTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

//go:embed assets/grafika-cobanovic-logo.png
var productionLoginLogo []byte

// LoginLogoVersion is a short content hash, used by clients to bust caches and
// by the logo endpoint as its ETag.
func LoginLogoVersion(logo *domain.LoginLogo) string {
	sum := sha256.Sum256(logo.Data)
	return hex.EncodeToString(sum[:6])
}

// storedLoginLogo is the JSON value kept in app_settings.
type storedLoginLogo struct {
	ContentType string `json:"contentType"`
	Data        []byte `json:"data"`
}

// normalizeLoginLogo decodes an upload and checks it against the size and
// format limits. The content type is taken from the bytes themselves, never
// from the client's claim alone.
func normalizeLoginLogo(upload domain.LoginLogoUpload) (*domain.LoginLogo, error) {
	encoded := strings.TrimSpace(upload.Data)
	if encoded == "" {
		return nil, newValidationError("Slika logotipa je obavezna.")
	}
	// Accept a full data: URL as well as bare base64.
	if strings.HasPrefix(encoded, "data:") {
		if comma := strings.IndexByte(encoded, ','); comma >= 0 {
			encoded = encoded[comma+1:]
		}
	}
	if base64.StdEncoding.DecodedLen(len(encoded)) > MaxLoginLogoBytes+3 {
		return nil, newValidationError("Logotip može imati najviše 512 KB.")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, newValidationError("Slika logotipa nije ispravno kodirana.")
	}
	if len(data) == 0 {
		return nil, newValidationError("Slika logotipa je obavezna.")
	}
	if len(data) > MaxLoginLogoBytes {
		return nil, newValidationError("Logotip može imati najviše 512 KB.")
	}
	sniffed := http.DetectContentType(data)
	if !allowedLoginLogoTypes[sniffed] {
		return nil, newValidationError("Logotip mora biti PNG, JPEG ili WebP slika.")
	}
	return &domain.LoginLogo{ContentType: sniffed, Data: data}, nil
}

// LoginLogo reads the tenant's sign-in logo from app_settings.
func (s *SQLiteStore) LoginLogo(ctx context.Context) (*domain.LoginLogo, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	var value string
	err = s.db.QueryRowContext(
		ctx,
		`SELECT value FROM app_settings WHERE tenant_id = ? AND key = ?`,
		tenantID,
		loginLogoSettingKey,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load login logo: %w", err)
	}
	var stored storedLoginLogo
	if err := json.Unmarshal([]byte(value), &stored); err != nil {
		return nil, fmt.Errorf("decode login logo: %w", err)
	}
	return &domain.LoginLogo{ContentType: stored.ContentType, Data: stored.Data}, nil
}

// SetLoginLogo validates and stores the tenant's sign-in logo.
func (s *SQLiteStore) SetLoginLogo(ctx context.Context, upload domain.LoginLogoUpload) (*domain.LoginLogo, error) {
	logo, err := normalizeLoginLogo(upload)
	if err != nil {
		return nil, err
	}
	value, err := json.Marshal(storedLoginLogo{ContentType: logo.ContentType, Data: logo.Data})
	if err != nil {
		return nil, fmt.Errorf("encode login logo: %w", err)
	}
	if err := s.upsertSetting(ctx, loginLogoSettingKey, string(value)); err != nil {
		return nil, err
	}
	return logo, nil
}

// DeleteLoginLogo removes the tenant's sign-in logo.
func (s *SQLiteStore) DeleteLoginLogo(ctx context.Context) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM app_settings WHERE tenant_id = ? AND key = ?`,
		tenantID,
		loginLogoSettingKey,
	); err != nil {
		return fmt.Errorf("delete login logo: %w", err)
	}
	s.invalidateSettings(tenantID)
	return nil
}

// LoginLogo returns the in-memory fixture logo.
func (s *FixtureStore) LoginLogo(_ context.Context) (*domain.LoginLogo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loginLogo == nil {
		return nil, nil
	}
	logo := *s.loginLogo
	return &logo, nil
}

// SetLoginLogo validates and keeps the logo in memory.
func (s *FixtureStore) SetLoginLogo(_ context.Context, upload domain.LoginLogoUpload) (*domain.LoginLogo, error) {
	logo, err := normalizeLoginLogo(upload)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loginLogo = logo
	return logo, nil
}

// DeleteLoginLogo clears the in-memory fixture logo.
func (s *FixtureStore) DeleteLoginLogo(_ context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loginLogo = nil
	return nil
}

// productionLoginLogoMigration gives Grafika Čobanović its sign-in logo. It only
// fills the slot when empty, so a logo an admin already uploaded survives, and
// it is skipped on databases without the production tenant.
func productionLoginLogoMigration(ctx context.Context, db *sql.DB) error {
	value, err := json.Marshal(storedLoginLogo{ContentType: "image/png", Data: productionLoginLogo})
	if err != nil {
		return fmt.Errorf("encode production login logo: %w", err)
	}
	if _, err := db.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO app_settings(tenant_id, key, value)
		 SELECT id, ?, ? FROM tenants WHERE id = ?`,
		loginLogoSettingKey,
		string(value),
		ProductionTenantID,
	); err != nil {
		return fmt.Errorf("seed production login logo: %w", err)
	}
	return nil
}
