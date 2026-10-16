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

// MaxPasswordBytes is bcrypt's hard limit: it refuses to hash anything longer,
// which used to surface as a generic 500. Letters with diacritics (č, ć, š, ž,
// đ) take two bytes each in UTF-8, so the limit in characters can be lower.
const MaxPasswordBytes = 72

// tooLongPasswordMessage explains the byte limit in terms a user can act on.
var tooLongPasswordMessage = fmt.Sprintf(
	"Lozinka je preduga: najviše %d znakova (slova č, ć, š, ž i đ računaju se kao dva).",
	MaxPasswordBytes,
)

// checkPasswordMaxLength rejects passwords bcrypt cannot hash, with a message
// the form can show as is. Every path that hashes a password calls it first.
func checkPasswordMaxLength(password string) error {
	if len(password) > MaxPasswordBytes {
		return newValidationError(tooLongPasswordMessage)
	}
	return nil
}

// validateUserPassword enforces the password length limits.
func validateUserPassword(password string) error {
	if len([]rune(strings.TrimSpace(password))) < minPasswordRunes {
		return newValidationError("Lozinka mora imati najmanje 6 karaktera.")
	}
	return checkPasswordMaxLength(password)
}

func newUserID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create user id: %w", err)
	}
	return "user-" + hex.EncodeToString(raw[:]), nil
}
