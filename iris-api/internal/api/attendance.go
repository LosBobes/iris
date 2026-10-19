package api

import (
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Attendance ("Prisustvo", D-027): who is at work on a date. It sits behind
// its own attendance module, so a shop can use it without planning; reads are
// open to every signed-in user and overrides are admin-only.

// attendanceHandler resolves the attendance store once per request; a store
// without it (the fixture store) has no such routes.
func (s *Server) attendanceHandler(handle func(w http.ResponseWriter, r *http.Request, attendance store.AttendanceStore)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		attendance, ok := s.store.(store.AttendanceStore)
		if !ok {
			http.NotFound(w, r)
			return
		}
		handle(w, r, attendance)
	}
}

func (s *Server) handleAttendance(w http.ResponseWriter, r *http.Request, attendance store.AttendanceStore) {
	date, ok := queryDate(w, r)
	if !ok {
		return
	}
	entries, err := attendance.Attendance(r.Context(), date)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleSetAttendance(w http.ResponseWriter, r *http.Request, attendance store.AttendanceStore) {
	var input domain.AttendanceInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	entry, err := attendance.SetAttendance(r.Context(), chi.URLParam(r, "userId"), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}
