package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Attendance ("Prisustvo", D-027): who is at work on a local date. A user is
// present when they signed in that day (login_events) unless an admin set an
// override (attendance_overrides). It is its own organization module so a shop
// can use it without planning; planning requires it and reads the same data
// for the workers of a plan. Dates are local to the working-hours time zone
// (which defaults to Europe/Belgrade when planning never set it).

// AttendanceStore is the persistence of the Prisustvo module. Like
// PlanningStore it is separate from Store: only the SQL store has it.
type AttendanceStore interface {
	// Attendance lists every user's presence on a local date ("" = today).
	Attendance(ctx context.Context, date string) ([]domain.AttendanceEntry, error)
	// SetAttendance sets or clears one user's override; ErrPlanningUserNotFound
	// for an unknown user.
	SetAttendance(ctx context.Context, userID string, input domain.AttendanceInput) (*domain.AttendanceEntry, error)
}

const planningDateLayout = "2006-01-02"

// ValidPlanningDate reports whether date is a real "YYYY-MM-DD".
func ValidPlanningDate(date string) bool {
	parsed, err := time.Parse(planningDateLayout, date)
	return err == nil && parsed.Format(planningDateLayout) == date
}

// planningToday is the local date of now in the working-hours time zone.
func planningToday(now time.Time, location *time.Location) string {
	return now.In(location).Format(planningDateLayout)
}

// signedInUsers returns the users with a login_events row on the local date.
// Impersonated sessions are never recorded there.
func signedInUsers(ctx context.Context, q dbExecQuerier, tenantID, date string, location *time.Location) (map[string]bool, error) {
	day, err := time.ParseInLocation(planningDateLayout, date, location)
	if err != nil {
		return nil, newValidationError(invalidPlanningDate)
	}
	next := time.Date(day.Year(), day.Month(), day.Day()+1, 0, 0, 0, 0, location)
	rows, err := q.QueryContext(
		ctx,
		`SELECT DISTINCT user_id FROM login_events WHERE tenant_id = ? AND at >= ? AND at < ?`,
		tenantID, day.UTC().Format(time.RFC3339), next.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return nil, fmt.Errorf("load sign-ins: %w", err)
	}
	defer rows.Close()
	signedIn := map[string]bool{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, fmt.Errorf("scan sign-in: %w", err)
		}
		signedIn[userID] = true
	}
	return signedIn, rows.Err()
}

// attendanceOverrides maps user id -> date -> present for dates from `from`
// on ("" = all).
func attendanceOverrides(ctx context.Context, q dbExecQuerier, tenantID, from string) (map[string]map[string]bool, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT user_id, date, present FROM attendance_overrides WHERE tenant_id = ? AND date >= ?`,
		tenantID, from,
	)
	if err != nil {
		return nil, fmt.Errorf("load attendance overrides: %w", err)
	}
	defer rows.Close()
	overrides := map[string]map[string]bool{}
	for rows.Next() {
		var userID, date string
		var present int
		if err := rows.Scan(&userID, &date, &present); err != nil {
			return nil, fmt.Errorf("scan attendance override: %w", err)
		}
		if overrides[userID] == nil {
			overrides[userID] = map[string]bool{}
		}
		overrides[userID][date] = present != 0
	}
	return overrides, rows.Err()
}

func attendanceEntries(
	users []planningUser, date string, signedIn map[string]bool, overrides map[string]map[string]bool,
) []domain.AttendanceEntry {
	entries := make([]domain.AttendanceEntry, 0, len(users))
	for _, user := range users {
		entry := domain.AttendanceEntry{UserID: user.id, Username: user.username, Date: date, SignedIn: signedIn[user.id]}
		entry.Present = entry.SignedIn
		if present, ok := overrides[user.id][date]; ok {
			value := present
			entry.Override = &value
			entry.Present = value
		}
		entries = append(entries, entry)
	}
	return entries
}

func (s *SQLiteStore) Attendance(ctx context.Context, date string) ([]domain.AttendanceEntry, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return s.attendanceFor(ctx, s.db, tenantID, date, nil)
}

// attendanceFor builds the entries of one date; only is a user-id filter (nil =
// everyone).
func (s *SQLiteStore) attendanceFor(ctx context.Context, q dbExecQuerier, tenantID, date string, only *string) ([]domain.AttendanceEntry, error) {
	hours, err := readWorkingHours(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	location := planningLocation(hours)
	if date == "" {
		date = planningToday(s.planningNow(), location)
	}
	if !ValidPlanningDate(date) {
		return nil, newValidationError(invalidPlanningDate)
	}
	users, err := listPlanningUsers(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	if only != nil {
		filtered := users[:0]
		for _, user := range users {
			if user.id == *only {
				filtered = append(filtered, user)
			}
		}
		users = filtered
	}
	signedIn, err := signedInUsers(ctx, q, tenantID, date, location)
	if err != nil {
		return nil, err
	}
	overrides, err := attendanceOverrides(ctx, q, tenantID, date)
	if err != nil {
		return nil, err
	}
	return attendanceEntries(users, date, signedIn, overrides), nil
}

// SetAttendance sets (Present true/false) or clears (nil) the override of one
// user on a date and returns the resulting entry. It returns
// ErrPlanningUserNotFound for an unknown user.
func (s *SQLiteStore) SetAttendance(ctx context.Context, userID string, input domain.AttendanceInput) (*domain.AttendanceEntry, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	date := strings.TrimSpace(input.Date)
	if !ValidPlanningDate(date) {
		return nil, newValidationError(invalidPlanningDate)
	}
	user, err := planningUserByID(ctx, s.db, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrPlanningUserNotFound
	}
	if input.Present == nil {
		_, err = s.db.ExecContext(
			ctx, `DELETE FROM attendance_overrides WHERE user_id = ? AND date = ? AND tenant_id = ?`, userID, date, tenantID,
		)
	} else {
		_, err = s.db.ExecContext(
			ctx,
			`INSERT INTO attendance_overrides(tenant_id, user_id, date, present) VALUES (?, ?, ?, ?)
			 ON CONFLICT(user_id, date) DO UPDATE SET present = excluded.present`,
			tenantID, userID, date, boolInt(*input.Present),
		)
	}
	if err != nil {
		return nil, fmt.Errorf("save attendance override: %w", err)
	}
	entries, err := s.attendanceFor(ctx, s.db, tenantID, date, &userID)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ErrPlanningUserNotFound
	}
	return &entries[0], nil
}
