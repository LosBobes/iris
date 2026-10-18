package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// A minimal valid 1x1 PNG.
var testPNG, _ = base64.StdEncoding.DecodeString(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
)

func decodePublicOrganization(t *testing.T, body []byte) domain.PublicOrganization {
	t.Helper()
	var org domain.PublicOrganization
	if err := json.Unmarshal(body, &org); err != nil {
		t.Fatalf("decode organization: %v", err)
	}
	return org
}

// TestPublicOrganizationLookup is the first sign-in step: a known slug resolves
// (case-insensitively) to the name the screen shows; an unknown one is a 404.
func TestPublicOrganizationLookup(t *testing.T) {
	server := newTestServer(t)

	rec := performRequest(t, server, http.MethodGet, "/public/organizations/DEMO", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("known slug = %d, want %d", rec.Code, http.StatusOK)
	}
	org := decodePublicOrganization(t, rec.Body.Bytes())
	if org.Slug != "demo" || org.Name == "" || org.LogoVersion != nil {
		t.Fatalf("organization = %+v, want demo with a name and no logo", org)
	}

	rec = performRequest(t, server, http.MethodGet, "/public/organizations/nope", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown slug = %d, want %d", rec.Code, http.StatusNotFound)
	}
	assertErrorResponse(t, rec.Body.Bytes(), "Organizacija nije pronađena.")

	rec = performRequest(t, server, http.MethodGet, "/public/organizations/demo/logo", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("logo before upload = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// TestLoginLogoLifecycle covers an admin uploading, the sign-in screen seeing
// it without a session, and the admin removing it again.
func TestLoginLogoLifecycle(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)
	payload := `{"contentType":"image/png","data":"` + base64.StdEncoding.EncodeToString(testPNG) + `"}`

	if rec := roleRequest(t, server, userToken, http.MethodPut, "/settings/login-logo", payload); rec.Code != http.StatusForbidden {
		t.Fatalf("upload as user = %d, want %d", rec.Code, http.StatusForbidden)
	}

	rec := roleRequest(t, server, adminToken, http.MethodPut, "/settings/login-logo", payload)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload as admin = %d (%s), want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
	var info domain.LoginLogoInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &info); err != nil || info.LogoVersion == "" {
		t.Fatalf("upload response = %s, want a logo version", rec.Body.String())
	}

	org := decodePublicOrganization(t, performRequest(t, server, http.MethodGet, "/public/organizations/demo", "").Body.Bytes())
	if org.LogoVersion == nil || *org.LogoVersion != info.LogoVersion {
		t.Fatalf("public logoVersion = %v, want %q", org.LogoVersion, info.LogoVersion)
	}

	rec = performRequest(t, server, http.MethodGet, "/public/organizations/demo/logo", "")
	if rec.Code != http.StatusOK || rec.Body.String() != string(testPNG) {
		t.Fatalf("public logo = %d, want the uploaded bytes", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}

	// The ETag lets clients revalidate cheaply.
	rec = performRequestWithHeaders(t, server, http.MethodGet, "/public/organizations/demo/logo", "",
		map[string]string{"If-None-Match": `"` + info.LogoVersion + `"`})
	if rec.Code != http.StatusNotModified {
		t.Fatalf("conditional logo = %d, want %d", rec.Code, http.StatusNotModified)
	}

	if rec := roleRequest(t, server, userToken, http.MethodGet, "/settings/login-logo", ""); rec.Code != http.StatusOK {
		t.Fatalf("settings logo as user = %d, want %d", rec.Code, http.StatusOK)
	}

	if rec := roleRequest(t, server, userToken, http.MethodDelete, "/settings/login-logo", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("delete as user = %d, want %d", rec.Code, http.StatusForbidden)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodDelete, "/settings/login-logo", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete as admin = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if rec := performRequest(t, server, http.MethodGet, "/public/organizations/demo/logo", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("logo after delete = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// TestLoginLogoRejectsUnsafeUploads: the bytes decide the type, so an SVG (which
// would run script if opened from the API origin) or junk labelled image/png is
// refused, as is anything over the size cap.
func TestLoginLogoRejectsUnsafeUploads(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	svg := base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))
	oversized := base64.StdEncoding.EncodeToString(append(append([]byte{}, testPNG...), make([]byte, 600<<10)...))

	cases := map[string]string{
		"svg":        `{"contentType":"image/png","data":"` + svg + `"}`,
		"not base64": `{"contentType":"image/png","data":"%%%"}`,
		"empty":      `{"contentType":"image/png","data":""}`,
		"oversized":  `{"contentType":"image/png","data":"` + oversized + `"}`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			rec := roleRequest(t, server, adminToken, http.MethodPut, "/settings/login-logo", payload)
			// The oversized body may also trip the 1 MiB JSON cap (400).
			if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 422 or 400", rec.Code)
			}
		})
	}
}
