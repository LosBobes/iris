// Temporary helper: set the admin user's password in a SQLite db.
// Reads NEW_PW and DB from the environment. Delete after use.
package main

import (
	"database/sql"
	"log"
	"os"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	dbPath := os.Getenv("DB")
	pw := os.Getenv("NEW_PW")
	user := os.Getenv("USER_NAME")
	if user == "" {
		user = "admin"
	}
	if dbPath == "" || pw == "" {
		log.Fatal("set DB and NEW_PW env vars")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	res, err := db.Exec(
		`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?`,
		string(hash), user,
	)
	if err != nil {
		log.Fatal(err)
	}
	n, _ := res.RowsAffected()
	log.Printf("updated %d row(s) for user %q", n, user)
}
