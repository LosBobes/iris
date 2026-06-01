package store

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

func newSessionToken() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
