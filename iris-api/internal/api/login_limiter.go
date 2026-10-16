package api

import (
	"sync"
	"time"
)

// loginLimiter throttles failed sign-ins. Each attempt is checked against
// several keys (client IP, username) and one global budget: per-key limits stop
// a single guesser, the global one bounds a distributed attempt or a client
// that spoofs its forwarded IP. Successful logins clear their keys.
type loginLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	perKey   int
	global   int
	failures map[string][]time.Time
	all      []time.Time
	now      func() time.Time
}

func newLoginLimiter(window time.Duration, perKey, global int) *loginLimiter {
	return &loginLimiter{
		window:   window,
		perKey:   perKey,
		global:   global,
		failures: map[string][]time.Time{},
		now:      time.Now,
	}
}

func (l *loginLimiter) prune(times []time.Time, cutoff time.Time) []time.Time {
	kept := times[:0]
	for _, at := range times {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	return kept
}

// allow reports whether another attempt may be made for these keys.
func (l *loginLimiter) allow(keys ...string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-l.window)
	l.all = l.prune(l.all, cutoff)
	if len(l.all) >= l.global {
		return false
	}
	for _, key := range keys {
		l.failures[key] = l.prune(l.failures[key], cutoff)
		if len(l.failures[key]) == 0 {
			delete(l.failures, key)
			continue
		}
		if len(l.failures[key]) >= l.perKey {
			return false
		}
	}
	return true
}

func (l *loginLimiter) fail(keys ...string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	at := l.now()
	l.all = append(l.all, at)
	for _, key := range keys {
		l.failures[key] = append(l.failures[key], at)
	}
}

func (l *loginLimiter) succeed(keys ...string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, key := range keys {
		delete(l.failures, key)
	}
}
