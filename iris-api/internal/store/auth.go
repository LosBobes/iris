package store

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func newSessionToken() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}

// hashSessionToken is how every session token (organization and Backoffice)
// is stored: a leaked database copy (a backup, say) must not hand out live
// sessions. The token is 256 random bits, so a plain SHA-256 is enough — no
// salt or slow hash is needed to stop guessing.
func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// dummyPasswordHash is compared against when a sign-in names an account that
// does not exist, so a failed login costs one bcrypt comparison either way and
// its timing does not reveal which usernames exist.
var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("iris-dummy-password"), bcrypt.DefaultCost)
