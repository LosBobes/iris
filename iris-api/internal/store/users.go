package store

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const minPasswordRunes = 6

// validateNewUserRole rejects unknown roles.
func validateUserRole(role domain.UserRole) error {
	if role != domain.RoleAdmin && role != domain.RoleUser {
		return newValidationError("Nepoznata uloga korisnika.")
	}
	return nil
}

// validateUserPassword enforces a minimum password length.
func validateUserPassword(password string) error {
	if len([]rune(strings.TrimSpace(password))) < minPasswordRunes {
		return newValidationError("Lozinka mora imati najmanje 6 karaktera.")
	}
	return nil
}

func newUserID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create user id: %w", err)
	}
	return "user-" + hex.EncodeToString(raw[:]), nil
}
