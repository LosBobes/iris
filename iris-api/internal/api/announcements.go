package api

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Platform announcements: superadmins manage them under /platform/announcements
// (every change audited by the store); organization users read the active ones
// for their organization from GET /announcements, and the sign-in page from
// GET /public/organizations/{slug}/announcements.

const announcementNotFoundMessage = "Obaveštenje ne postoji."

func (s *Server) announcementStore() (store.AnnouncementStore, bool) {
	announcements, ok := s.store.(store.AnnouncementStore)
	return announcements, ok
}

// writeActiveAnnouncements answers with the active announcements of the
// tenant in ctx (an empty list when the store keeps none).
func (s *Server) writeActiveAnnouncements(w http.ResponseWriter, r *http.Request, tenantID string) {
	items := []domain.Announcement{}
	if announcements, ok := s.announcementStore(); ok {
		var err error
		items, err = announcements.ActiveAnnouncements(store.ContextWithTenant(r.Context(), tenantID), time.Now())
		if err != nil {
			writeServerError(w, r, err)
			return
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, items)
}

// handleAnnouncements lists the announcements active now for the session's
// organization.
func (s *Server) handleAnnouncements(w http.ResponseWriter, r *http.Request) {
	s.writeActiveAnnouncements(w, r, currentUser(r).TenantID)
}

// handlePublicAnnouncements lists them for the sign-in page of an
// organization: message, severity and time window only.
func (s *Server) handlePublicAnnouncements(w http.ResponseWriter, r *http.Request) {
	tenant, ok := s.publicTenant(w, r)
	if !ok {
		return
	}
	s.writeActiveAnnouncements(w, r, tenant.ID)
}

func writeAnnouncementError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, store.ErrAnnouncementNotFound) {
		writeAPIError(w, r, http.StatusNotFound, announcementNotFoundMessage, nil)
		return
	}
	writeStoreError(w, r, err)
}

func (s *Server) handlePlatformAnnouncements(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	items, err := platform.PlatformAnnouncements(r.Context(), time.Now())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handlePlatformCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformAnnouncementInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	item, err := platform.PlatformCreateAnnouncement(r.Context(), auditActor(r), input, time.Now())
	if err != nil {
		writeAnnouncementError(w, r, err)
		return
	}
	log.Printf("platform admin %q created announcement %q (%s)", currentPlatformAdmin(r).Username, item.ID, item.Severity)
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handlePlatformUpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformAnnouncementInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	item, err := platform.PlatformUpdateAnnouncement(r.Context(), auditActor(r), chi.URLParam(r, "id"), input, time.Now())
	if err != nil {
		writeAnnouncementError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handlePlatformEndAnnouncement(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	item, err := platform.PlatformEndAnnouncement(r.Context(), auditActor(r), chi.URLParam(r, "id"), time.Now())
	if err != nil {
		writeAnnouncementError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handlePlatformDeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	id := chi.URLParam(r, "id")
	if err := platform.PlatformDeleteAnnouncement(r.Context(), auditActor(r), id, time.Now()); err != nil {
		writeAnnouncementError(w, r, err)
		return
	}
	log.Printf("platform admin %q deleted announcement %q", currentPlatformAdmin(r).Username, id)
	w.WriteHeader(http.StatusNoContent)
}
