package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/planner"
)

// Production planning ("Planiranje", D-026): machine types and units, worker
// qualifications and working hours. Day plans live in planning_plans.go;
// attendance, which planning reads but which is its own module (D-027), lives
// in attendance.go. Every query is scoped by the tenant in the context.
//
// PlanningStore is separate from Store on purpose: only the SQL store has
// planning data, the in-memory fixture store only carries the module flag. The
// API reaches it through a type assertion, like PlatformStore.

var (
	// ErrMachineTypeNotFound means the tenant has no machine type with that id.
	ErrMachineTypeNotFound = errors.New("machine type not found")
	// ErrMachineTypeNameTaken means another machine type already has the name.
	ErrMachineTypeNameTaken = errors.New("machine type name already used")
	// ErrMachineTypeInUse means machine units of the type still exist.
	ErrMachineTypeInUse = errors.New("machine type has machines")
	// ErrMachineNotFound means the tenant has no machine with that id.
	ErrMachineNotFound = errors.New("machine not found")
	// ErrMachineNameTaken means another machine already has the name.
	ErrMachineNameTaken = errors.New("machine name already used")
	// ErrPlanningUserNotFound means the tenant has no user with that id.
	ErrPlanningUserNotFound = errors.New("user not found")
	// ErrPlanDraftNotFound means the date has no draft plan.
	ErrPlanDraftNotFound = errors.New("draft plan not found")
)

// Serbian messages shared with the API layer.
const (
	MachineTypeNotFoundMessage = "Tip mašine nije pronađen."
	machineTypeNameRequired    = "Naziv tipa mašine je obavezan."
	machineTypeNameTooLong     = "Naziv tipa mašine je predugačak (najviše 120 znakova)."
	machineNameRequired        = "Naziv mašine je obavezan."
	machineNameTooLong         = "Naziv mašine je predugačak (najviše 120 znakova)."
	machineNoteTooLong         = "Napomena je predugačka (najviše 500 znakova)."
	invalidPlanningDate        = "Neispravan datum."
)

const workingHoursSettingKey = "working_hours"

// PlanningStore is the persistence of the Planiranje module. Methods return
// *ValidationError (422) for bad input and the sentinel errors above for
// missing rows and conflicts.
type PlanningStore interface {
	MachineTypes(ctx context.Context) ([]domain.MachineType, error)
	CreateMachineType(ctx context.Context, input domain.MachineTypeInput) (*domain.MachineType, error)
	UpdateMachineType(ctx context.Context, id string, input domain.MachineTypeInput) (*domain.MachineType, error)
	DeleteMachineType(ctx context.Context, id string) error

	Machines(ctx context.Context) ([]domain.Machine, error)
	CreateMachine(ctx context.Context, input domain.MachineInput) (*domain.Machine, error)
	UpdateMachine(ctx context.Context, id string, input domain.MachineInput) (*domain.Machine, error)
	DeleteMachine(ctx context.Context, id string) error

	Qualifications(ctx context.Context) ([]domain.WorkerQualifications, error)
	SetQualifications(ctx context.Context, userID string, input domain.WorkerQualificationsInput) (*domain.WorkerQualifications, error)

	WorkingHours(ctx context.Context) (domain.WorkingHours, error)
	SetWorkingHours(ctx context.Context, hours domain.WorkingHours) (domain.WorkingHours, error)

	// PlanDay returns the plans of a local date ("" = today); the draft only
	// when includeDraft is set (admins).
	PlanDay(ctx context.Context, date string, includeDraft bool) (domain.PlanDay, error)
	GeneratePlan(ctx context.Context, input domain.PlanGenerateInput, username string) (*domain.ProductionPlan, error)
	SavePlanDraft(ctx context.Context, input domain.PlanDraftInput, username string) (*domain.ProductionPlan, error)
	DiscardPlanDraft(ctx context.Context, date string) error
	PublishPlan(ctx context.Context, input domain.PlanPublishInput, username string) (*domain.ProductionPlan, error)
	MyQueue(ctx context.Context, userID, date string) (domain.MyQueue, error)
	Forecast(ctx context.Context) ([]domain.OrderForecast, error)
}

var _ PlanningStore = (*SQLiteStore)(nil)

// SetClock replaces the time source of the planning features (tests fix "now").
// It must be called before the store is shared between goroutines.
func (s *SQLiteStore) SetClock(clock func() time.Time) {
	s.clock = clock
}

func (s *SQLiteStore) planningNow() time.Time {
	if s.clock != nil {
		return s.clock()
	}
	return time.Now()
}

func newPlanningID(prefix string) (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create %s id: %w", prefix, err)
	}
	return prefix + "-" + hex.EncodeToString(raw[:]), nil
}

func nowStamp() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// ---- machine types ----

func prepareMachineTypeName(input domain.MachineTypeInput) (string, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return "", newValidationError(machineTypeNameRequired)
	}
	if utf8.RuneCountInString(name) > domain.MaxMachineNameLength {
		return "", newValidationError(machineTypeNameTooLong)
	}
	return name, nil
}

func scanMachineType(row interface{ Scan(...any) error }) (domain.MachineType, error) {
	var machineType domain.MachineType
	err := row.Scan(&machineType.ID, &machineType.Name, &machineType.CreatedAt, &machineType.UpdatedAt)
	return machineType, err
}

func listMachineTypes(ctx context.Context, q dbExecQuerier, tenantID string) ([]domain.MachineType, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT id, name, created_at, updated_at FROM machine_types WHERE tenant_id = ? ORDER BY name COLLATE NOCASE, id`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list machine types: %w", err)
	}
	defer rows.Close()
	types := make([]domain.MachineType, 0)
	for rows.Next() {
		machineType, err := scanMachineType(rows)
		if err != nil {
			return nil, fmt.Errorf("scan machine type: %w", err)
		}
		types = append(types, machineType)
	}
	return types, rows.Err()
}

func getMachineType(ctx context.Context, q dbExecQuerier, tenantID, id string) (*domain.MachineType, error) {
	machineType, err := scanMachineType(q.QueryRowContext(
		ctx,
		`SELECT id, name, created_at, updated_at FROM machine_types WHERE id = ? AND tenant_id = ?`,
		id, tenantID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load machine type: %w", err)
	}
	return &machineType, nil
}

func machineTypeExists(ctx context.Context, q dbExecQuerier, tenantID, id string) (bool, error) {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM machine_types WHERE id = ? AND tenant_id = ?`, id, tenantID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check machine type: %w", err)
	}
	return true, nil
}

func (s *SQLiteStore) MachineTypes(ctx context.Context) ([]domain.MachineType, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return listMachineTypes(ctx, s.db, tenantID)
}

func (s *SQLiteStore) CreateMachineType(ctx context.Context, input domain.MachineTypeInput) (*domain.MachineType, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	name, err := prepareMachineTypeName(input)
	if err != nil {
		return nil, err
	}
	id, err := newPlanningID("mtype")
	if err != nil {
		return nil, err
	}
	now := nowStamp()
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO machine_types(id, tenant_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, tenantID, name, now, now,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrMachineTypeNameTaken
		}
		return nil, fmt.Errorf("create machine type: %w", err)
	}
	return &domain.MachineType{ID: id, Name: name, CreatedAt: now, UpdatedAt: now}, nil
}

// UpdateMachineType renames a type. It returns ErrMachineTypeNotFound or
// ErrMachineTypeNameTaken.
func (s *SQLiteStore) UpdateMachineType(ctx context.Context, id string, input domain.MachineTypeInput) (*domain.MachineType, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	name, err := prepareMachineTypeName(input)
	if err != nil {
		return nil, err
	}
	now := nowStamp()
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE machine_types SET name = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
		name, now, id, tenantID,
	)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrMachineTypeNameTaken
		}
		return nil, fmt.Errorf("update machine type: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return nil, ErrMachineTypeNotFound
	}
	machineType, err := getMachineType(ctx, s.db, tenantID, id)
	if err != nil {
		return nil, err
	}
	if machineType == nil {
		return nil, ErrMachineTypeNotFound
	}
	return machineType, nil
}

// DeleteMachineType removes a type and its qualifications. It returns
// ErrMachineTypeNotFound, or ErrMachineTypeInUse while machine units exist.
func (s *SQLiteStore) DeleteMachineType(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete machine type: %w", err)
	}
	defer tx.Rollback()
	exists, err := machineTypeExists(ctx, tx, tenantID, id)
	if err != nil {
		return err
	}
	if !exists {
		return ErrMachineTypeNotFound
	}
	var machines int
	if err := tx.QueryRowContext(
		ctx, `SELECT COUNT(*) FROM machines WHERE machine_type_id = ? AND tenant_id = ?`, id, tenantID,
	).Scan(&machines); err != nil {
		return fmt.Errorf("count machines of type: %w", err)
	}
	if machines > 0 {
		return ErrMachineTypeInUse
	}
	if _, err := tx.ExecContext(
		ctx, `DELETE FROM worker_qualifications WHERE machine_type_id = ? AND tenant_id = ?`, id, tenantID,
	); err != nil {
		return fmt.Errorf("delete qualifications of type: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM machine_types WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return fmt.Errorf("delete machine type: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete machine type: %w", err)
	}
	return nil
}

// ---- machines ----

type preparedMachine struct {
	typeID    string
	name      string
	inService bool
	note      string
}

func prepareMachineInput(input domain.MachineInput) (preparedMachine, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return preparedMachine{}, newValidationError(machineNameRequired)
	}
	if utf8.RuneCountInString(name) > domain.MaxMachineNameLength {
		return preparedMachine{}, newValidationError(machineNameTooLong)
	}
	note := strings.TrimSpace(input.Note)
	if utf8.RuneCountInString(note) > domain.MaxMachineNoteLength {
		return preparedMachine{}, newValidationError(machineNoteTooLong)
	}
	typeID := strings.TrimSpace(input.MachineTypeID)
	if typeID == "" {
		return preparedMachine{}, newValidationError(MachineTypeNotFoundMessage)
	}
	return preparedMachine{typeID: typeID, name: name, inService: input.InService, note: note}, nil
}

const machineColumns = `id, machine_type_id, name, in_service, note, created_at, updated_at`

func scanMachine(row interface{ Scan(...any) error }) (domain.Machine, error) {
	var machine domain.Machine
	var inService int
	err := row.Scan(&machine.ID, &machine.MachineTypeID, &machine.Name, &inService, &machine.Note, &machine.CreatedAt, &machine.UpdatedAt)
	machine.InService = inService != 0
	return machine, err
}

func listMachines(ctx context.Context, q dbExecQuerier, tenantID string) ([]domain.Machine, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT `+machineColumns+` FROM machines WHERE tenant_id = ? ORDER BY name COLLATE NOCASE, id`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list machines: %w", err)
	}
	defer rows.Close()
	machines := make([]domain.Machine, 0)
	for rows.Next() {
		machine, err := scanMachine(rows)
		if err != nil {
			return nil, fmt.Errorf("scan machine: %w", err)
		}
		machines = append(machines, machine)
	}
	return machines, rows.Err()
}

func (s *SQLiteStore) Machines(ctx context.Context) ([]domain.Machine, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return listMachines(ctx, s.db, tenantID)
}

func (s *SQLiteStore) CreateMachine(ctx context.Context, input domain.MachineInput) (*domain.Machine, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareMachineInput(input)
	if err != nil {
		return nil, err
	}
	exists, err := machineTypeExists(ctx, s.db, tenantID, prepared.typeID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, newValidationError(MachineTypeNotFoundMessage)
	}
	id, err := newPlanningID("mach")
	if err != nil {
		return nil, err
	}
	now := nowStamp()
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO machines(id, tenant_id, machine_type_id, name, in_service, note, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, tenantID, prepared.typeID, prepared.name, boolInt(prepared.inService), prepared.note, now, now,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrMachineNameTaken
		}
		return nil, fmt.Errorf("create machine: %w", err)
	}
	return &domain.Machine{
		ID: id, MachineTypeID: prepared.typeID, Name: prepared.name, InService: prepared.inService,
		Note: prepared.note, CreatedAt: now, UpdatedAt: now,
	}, nil
}

// UpdateMachine returns ErrMachineNotFound or ErrMachineNameTaken.
func (s *SQLiteStore) UpdateMachine(ctx context.Context, id string, input domain.MachineInput) (*domain.Machine, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareMachineInput(input)
	if err != nil {
		return nil, err
	}
	exists, err := machineTypeExists(ctx, s.db, tenantID, prepared.typeID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, newValidationError(MachineTypeNotFoundMessage)
	}
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE machines SET machine_type_id = ?, name = ?, in_service = ?, note = ?, updated_at = ?
		 WHERE id = ? AND tenant_id = ?`,
		prepared.typeID, prepared.name, boolInt(prepared.inService), prepared.note, nowStamp(), id, tenantID,
	)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrMachineNameTaken
		}
		return nil, fmt.Errorf("update machine: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return nil, ErrMachineNotFound
	}
	machine, err := scanMachine(s.db.QueryRowContext(
		ctx, `SELECT `+machineColumns+` FROM machines WHERE id = ? AND tenant_id = ?`, id, tenantID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMachineNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load machine: %w", err)
	}
	return &machine, nil
}

// DeleteMachine returns ErrMachineNotFound for an unknown id. Plans keep their
// blocks (they store the machine name).
func (s *SQLiteStore) DeleteMachine(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM machines WHERE id = ? AND tenant_id = ?`, id, tenantID)
	if err != nil {
		return fmt.Errorf("delete machine: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return ErrMachineNotFound
	}
	return nil
}

// ---- qualifications ----

// qualificationsByUser maps user id to the sorted machine type ids.
func qualificationsByUser(ctx context.Context, q dbExecQuerier, tenantID string) (map[string][]string, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT user_id, machine_type_id FROM worker_qualifications WHERE tenant_id = ? ORDER BY machine_type_id`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list qualifications: %w", err)
	}
	defer rows.Close()
	byUser := map[string][]string{}
	for rows.Next() {
		var userID, typeID string
		if err := rows.Scan(&userID, &typeID); err != nil {
			return nil, fmt.Errorf("scan qualification: %w", err)
		}
		byUser[userID] = append(byUser[userID], typeID)
	}
	return byUser, rows.Err()
}

type planningUser struct {
	id       string
	username string
}

func listPlanningUsers(ctx context.Context, q dbExecQuerier, tenantID string) ([]planningUser, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT id, username FROM users WHERE tenant_id = ? ORDER BY username COLLATE NOCASE, id`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	users := make([]planningUser, 0)
	for rows.Next() {
		var user planningUser
		if err := rows.Scan(&user.id, &user.username); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func planningUserByID(ctx context.Context, q dbExecQuerier, tenantID, id string) (*planningUser, error) {
	user := planningUser{id: id}
	err := q.QueryRowContext(
		ctx, `SELECT username FROM users WHERE id = ? AND tenant_id = ?`, id, tenantID,
	).Scan(&user.username)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}
	return &user, nil
}

func (s *SQLiteStore) Qualifications(ctx context.Context) ([]domain.WorkerQualifications, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	users, err := listPlanningUsers(ctx, s.db, tenantID)
	if err != nil {
		return nil, err
	}
	byUser, err := qualificationsByUser(ctx, s.db, tenantID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.WorkerQualifications, 0, len(users))
	for _, user := range users {
		ids := byUser[user.id]
		if ids == nil {
			ids = []string{}
		}
		out = append(out, domain.WorkerQualifications{UserID: user.id, Username: user.username, MachineTypeIDs: ids})
	}
	return out, nil
}

// SetQualifications replaces one user's qualifications. It returns
// ErrPlanningUserNotFound, or a validation error for an unknown machine type.
func (s *SQLiteStore) SetQualifications(ctx context.Context, userID string, input domain.WorkerQualificationsInput) (*domain.WorkerQualifications, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin set qualifications: %w", err)
	}
	defer tx.Rollback()
	user, err := planningUserByID(ctx, tx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrPlanningUserNotFound
	}
	seen := map[string]bool{}
	ids := make([]string, 0, len(input.MachineTypeIDs))
	for _, raw := range input.MachineTypeIDs {
		id := strings.TrimSpace(raw)
		if seen[id] {
			continue
		}
		seen[id] = true
		exists, err := machineTypeExists(ctx, tx, tenantID, id)
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, newValidationError(MachineTypeNotFoundMessage)
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if _, err := tx.ExecContext(ctx, `DELETE FROM worker_qualifications WHERE user_id = ? AND tenant_id = ?`, userID, tenantID); err != nil {
		return nil, fmt.Errorf("clear qualifications: %w", err)
	}
	for _, id := range ids {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO worker_qualifications(tenant_id, user_id, machine_type_id) VALUES (?, ?, ?)`,
			tenantID, userID, id,
		); err != nil {
			return nil, fmt.Errorf("insert qualification: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit set qualifications: %w", err)
	}
	return &domain.WorkerQualifications{UserID: user.id, Username: user.username, MachineTypeIDs: ids}, nil
}

// ---- working hours ----

func readWorkingHours(ctx context.Context, q dbExecQuerier, tenantID string) (domain.WorkingHours, error) {
	var raw string
	err := q.QueryRowContext(
		ctx, `SELECT value FROM app_settings WHERE tenant_id = ? AND key = ?`, tenantID, workingHoursSettingKey,
	).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.DefaultWorkingHours(), nil
	}
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("load working hours: %w", err)
	}
	var hours domain.WorkingHours
	if err := json.Unmarshal([]byte(raw), &hours); err != nil || hours.TimeZone == "" {
		return domain.DefaultWorkingHours(), nil
	}
	return normalizeWorkingHours(hours), nil
}

// normalizeWorkingHours sorts the days and turns nil slices into empty ones so
// the JSON always carries arrays.
func normalizeWorkingHours(hours domain.WorkingHours) domain.WorkingHours {
	days := make([]domain.WorkingDay, len(hours.Days))
	for i, day := range hours.Days {
		breaks := make([]domain.WorkingBreak, len(day.Breaks))
		copy(breaks, day.Breaks)
		sort.Slice(breaks, func(a, b int) bool { return breaks[a].Start < breaks[b].Start })
		day.Breaks = breaks
		days[i] = day
	}
	sort.Slice(days, func(a, b int) bool { return days[a].Weekday < days[b].Weekday })
	return domain.WorkingHours{
		TimeZone: strings.TrimSpace(hours.TimeZone), Days: days, TransferMinutes: hours.TransferMinutes,
	}
}

// planningLocation loads the working-hours time zone, falling back to the
// default zone for a value the host cannot load.
func planningLocation(hours domain.WorkingHours) *time.Location {
	if location, err := time.LoadLocation(hours.TimeZone); err == nil {
		return location
	}
	if location, err := time.LoadLocation(domain.DefaultPlanningTimeZone); err == nil {
		return location
	}
	return time.UTC
}

func (s *SQLiteStore) WorkingHours(ctx context.Context) (domain.WorkingHours, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.WorkingHours{}, err
	}
	return readWorkingHours(ctx, s.db, tenantID)
}

// SetWorkingHours validates (planner.ValidateWorkingHours) and stores the
// organization's working hours.
func (s *SQLiteStore) SetWorkingHours(ctx context.Context, hours domain.WorkingHours) (domain.WorkingHours, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.WorkingHours{}, err
	}
	hours = normalizeWorkingHours(hours)
	if message := planner.ValidateWorkingHours(hours); message != "" {
		return domain.WorkingHours{}, newValidationError(message)
	}
	raw, err := json.Marshal(hours)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("encode working hours: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO app_settings(tenant_id, key, value) VALUES (?, ?, ?)
		 ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value`,
		tenantID, workingHoursSettingKey, string(raw),
	); err != nil {
		return domain.WorkingHours{}, fmt.Errorf("save working hours: %w", err)
	}
	return hours, nil
}

// ---- machine type references in process graphs ----

// machineTypeLinkSkip ignores nodes whose machine type is stored unchanged in
// current (same id and machineTypeId), so deleting a machine type never makes
// an old process unsavable. Changing the type re-validates the node.
func machineTypeLinkSkip(current domain.ProcessGraph) func(domain.ProcessNode) bool {
	stored := make(map[[2]string]bool, len(current.Nodes))
	for _, node := range current.Nodes {
		if node.MachineTypeID != "" {
			stored[[2]string{node.ID, node.MachineTypeID}] = true
		}
	}
	return func(node domain.ProcessNode) bool {
		return stored[[2]string{node.ID, node.MachineTypeID}]
	}
}

// validateGraphMachineTypes requires every machine type a step names to exist
// in the tenant, except nodes skip reports as unchanged.
func validateGraphMachineTypes(
	ctx context.Context, q dbExecQuerier, tenantID string, graph domain.ProcessGraph, skip func(domain.ProcessNode) bool,
) error {
	checked := map[string]bool{}
	for _, node := range graph.Nodes {
		if node.MachineTypeID == "" || (skip != nil && skip(node)) || checked[node.MachineTypeID] {
			continue
		}
		exists, err := machineTypeExists(ctx, q, tenantID, node.MachineTypeID)
		if err != nil {
			return err
		}
		if !exists {
			return newValidationError(MachineTypeNotFoundMessage)
		}
		checked[node.MachineTypeID] = true
	}
	return nil
}
