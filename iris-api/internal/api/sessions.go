package api

import (
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// Organization session lifetime, sign-in throttling and request-origin checks.
//
// A session slides: every authenticated request may push its idle expiry to
// now + idle timeout, never past the absolute cap fixed at sign-in. To keep
// the single SQLite writer quiet, the expiry is only rewritten once it would
// move by at least SessionRefreshInterval (or to reach the cap). "Zapamti me"
// (LoginRequest.remember) picks the long lifetimes and a persistent cookie
// whose Expires/Max-Age always equals the server-side expiry; without it the
// cookie lasts for the browser session. Impersonation sessions keep their
// fixed hour and are never extended.

const (
	defaultSessionIdleTimeout         = 12 * time.Hour
	defaultSessionMaxLifetime         = 24 * time.Hour
	defaultRememberSessionIdleTimeout = 7 * 24 * time.Hour
	defaultRememberSessionMaxLifetime = 30 * 24 * time.Hour
	defaultSessionRefreshInterval     = time.Hour

	loginRateLimitedMessage = "Previše neuspešnih pokušaja. Pokušajte ponovo kasnije."
	crossOriginMessage      = "Zahtev sa druge adrese nije dozvoljen."
)

// sessionLifetimes returns the idle timeout and absolute cap for a session.
func (s *Server) sessionLifetimes(remember bool) (idle, max time.Duration) {
	if remember {
		return s.config.RememberSessionDuration, s.config.RememberSessionMaxLifetime
	}
	return s.config.SessionDuration, s.config.SessionMaxLifetime
}

// newSessionExpiry returns the first idle expiry and the absolute cap of a
// session signed in now.
func (s *Server) newSessionExpiry(now time.Time, remember bool) (expiresAt, absolute time.Time) {
	idle, max := s.sessionLifetimes(remember)
	absolute = now.Add(max)
	expiresAt = now.Add(idle)
	if expiresAt.After(absolute) {
		expiresAt = absolute
	}
	return expiresAt, absolute
}

// refreshSession slides an ordinary session's idle expiry forward (throttled)
// and, for a remembered session, re-sends the cookie with the new expiry. A
// failure to extend is logged and the request carries on: the session is
// still valid until its current expiry.
func (s *Server) refreshSession(w http.ResponseWriter, r *http.Request, token string, session *store.Session) {
	if session.User.ImpersonationID != 0 {
		return
	}
	idle, _ := s.sessionLifetimes(session.Remember)
	next := time.Now().UTC().Add(idle)
	capped := false
	if !next.Before(session.AbsoluteExpiresAt) {
		next = session.AbsoluteExpiresAt
		capped = true
	}
	gain := next.Sub(session.ExpiresAt)
	if gain <= 0 || (gain < s.config.SessionRefreshInterval && !capped) {
		return
	}
	if err := s.store.ExtendSession(r.Context(), token, next); err != nil {
		log.Printf("extend session: %v", err)
		return
	}
	if session.Remember {
		setSessionCookie(w, s.config, token, next, true)
	}
}

// sessionFromCookie loads the live session behind the request's cookie. It
// returns nil (and no error) when there is no cookie or no live session.
func (s *Server) sessionFromCookie(r *http.Request) (string, *store.Session, error) {
	cookie, err := r.Cookie(s.config.SessionCookieName)
	if err != nil || cookie.Value == "" {
		return "", nil, nil
	}
	session, err := s.store.SessionByToken(r.Context(), cookie.Value)
	return cookie.Value, session, err
}

// Organization sign-in throttling, all in a 15-minute window and counted
// before the credentials are checked (reserve):
//   - 5 failures per organization + username from one client IP: the limit a
//     guesser actually meets;
//   - 20 per client IP across all usernames (a shared office behind one NAT
//     address gets that much room);
//   - 50 per organization + username from anywhere: a much looser account-wide
//     ceiling against a distributed guesser. A single address cannot reach it
//     (it is blocked at 5), so locking someone out takes at least ten addresses.
//
// There is deliberately no global budget, unlike the Backoffice: one guesser
// could otherwise lock every organization out at once.
const (
	orgLoginWindow     = 15 * time.Minute
	orgLoginPerPair    = 5
	orgLoginPerIP      = 20
	orgLoginPerAccount = 50
)

func newOrgLoginLimiter() *loginLimiter {
	return newLoginLimiter(orgLoginWindow, orgLoginPerPair, 0)
}

func orgLoginKeys(r *http.Request, req domain.LoginRequest) []limiterKey {
	ip := clientIP(r)
	account := strings.ToLower(strings.TrimSpace(req.OrgSlug)) + ":" +
		strings.ToLower(strings.TrimSpace(req.Username))
	return []limiterKey{
		{key: "pair:" + ip + "|" + account, max: orgLoginPerPair},
		{key: "ip:" + ip, max: orgLoginPerIP},
		{key: "account:" + account, max: orgLoginPerAccount},
	}
}

// proxyRealIP replaces chi's middleware.RealIP. That one trusts, in order,
// True-Client-IP, X-Real-IP and the first X-Forwarded-For entry — all of which
// a browser can send, and frontend/nginx.conf passes True-Client-IP and
// X-Forwarded-For through untouched, so the sign-in limiter's IP key would be
// whatever the client claimed. Only X-Real-IP is used here: nginx always
// overwrites it with the address it resolved, which is its TCP peer unless
// that peer is a proxy listed in IRIS_TRUSTED_PROXY (frontend/iris-real-ip.sh;
// only the Hetzner deploy sets it, to the compose gateway Caddy arrives from).
// Without it (dev, tests) the TCP peer address stands.
func proxyRealIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" && net.ParseIP(ip) != nil {
			r.RemoteAddr = ip
		}
		next.ServeHTTP(w, r)
	})
}

// originGuard rejects a state-changing request (anything but GET, HEAD and
// OPTIONS) that a browser sent from another site: an Origin header that is
// neither this host nor on the CORS allow-list. It backs up the SameSite=Lax
// session cookie against cross-site request forgery. Requests without Origin
// (curl, irisctl, older browsers on same-origin requests) pass.
//
// Same-origin compares host names only, not scheme or port: behind nginx the
// API sees plain http and nginx forwards $host, which drops the port, while
// the browser's Origin keeps both.
func (s *Server) originGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" || s.isAllowedOrigin(origin) || isSameHostOrigin(origin, r.Host) {
			next.ServeHTTP(w, r)
			return
		}
		writeAPIError(w, r, http.StatusForbidden, crossOriginMessage, nil)
	})
}

func isSameHostOrigin(origin, requestHost string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	host := (&url.URL{Host: requestHost}).Hostname()
	return host != "" && strings.EqualFold(parsed.Hostname(), host)
}
