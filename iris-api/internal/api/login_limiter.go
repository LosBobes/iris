package api

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// loginLimiter throttles failed sign-ins. Each attempt is counted under
// several keys (client IP, username, ...), each with its own limit, and one
// optional global budget: per-key limits stop a single guesser, the global one
// bounds a distributed attempt or a client that spoofs its forwarded IP.
// Successful logins clear their keys. A global budget of zero or less means
// none (organization sign-in uses that: one shared budget would let a single
// guesser lock every organization out).
//
// Checking and counting are one step: reserve counts the attempt as a failure
// up front, under the lock, so concurrent bad attempts cannot all pass the
// check before any of them is recorded. The caller then settles the attempt:
// succeeded clears its keys, cancel withdraws it when the credentials were
// never judged (a store error), and a failure needs nothing more.
type loginLimiter struct {
	mu        sync.Mutex
	window    time.Duration
	perKey    int
	global    int
	failures  map[string][]time.Time
	all       []time.Time
	now       func() time.Time
	lastSweep time.Time
	sweepAt   int
}

// limiterKey is one key an attempt is counted under, with its own limit.
type limiterKey struct {
	key string
	max int
}

const (
	// maxLimiterKeyLen bounds the bytes a key keeps in memory: longer keys
	// (attacker-chosen usernames) are stored as their SHA-256.
	maxLimiterKeyLen = 128
	// limiterSweepKeys triggers a sweep of expired keys once the map grows
	// past it, besides the periodic sweep once per window. After a sweep the
	// threshold becomes twice the keys still live, so a map full of live keys
	// is not rescanned on every attempt.
	limiterSweepKeys = 10000
)

func newLoginLimiter(window time.Duration, perKey, global int) *loginLimiter {
	return &loginLimiter{
		window:   window,
		perKey:   perKey,
		global:   global,
		failures: map[string][]time.Time{},
		now:      time.Now,
	}
}

// keys pairs each key with the limiter's default per-key limit.
func (l *loginLimiter) keys(keys ...string) []limiterKey {
	out := make([]limiterKey, len(keys))
	for i, k := range keys {
		out[i] = limiterKey{key: k, max: l.perKey}
	}
	return out
}

func limiterMapKey(key string) string {
	if len(key) <= maxLimiterKeyLen {
		return key
	}
	sum := sha256.Sum256([]byte(key))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func pruneTimes(times []time.Time, cutoff time.Time) []time.Time {
	kept := times[:0]
	for _, at := range times {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	return kept
}

// sweepLocked drops every key whose failures have all expired. It runs once
// per window, or sooner when the map grows large, so keys that are never
// checked again (one-off usernames) do not accumulate.
func (l *loginLimiter) sweepLocked(now time.Time) {
	if l.sweepAt < limiterSweepKeys {
		l.sweepAt = limiterSweepKeys
	}
	if len(l.failures) < l.sweepAt && now.Sub(l.lastSweep) < l.window {
		return
	}
	l.lastSweep = now
	cutoff := now.Add(-l.window)
	for key, times := range l.failures {
		if kept := pruneTimes(times, cutoff); len(kept) == 0 {
			delete(l.failures, key)
		} else {
			l.failures[key] = kept
		}
	}
	l.sweepAt = 2 * len(l.failures)
}

// loginAttempt is an attempt reserve let through. It already counts as a
// failure; call succeeded or cancel to change that.
type loginAttempt struct {
	l    *loginLimiter
	keys []string
	at   time.Time
}

// reserve reports whether another attempt may be made under these keys and,
// if so, counts it as a failure right away.
func (l *loginLimiter) reserve(keys ...limiterKey) (*loginAttempt, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweepLocked(now)
	cutoff := now.Add(-l.window)
	l.all = pruneTimes(l.all, cutoff)
	if l.global > 0 && len(l.all) >= l.global {
		return nil, false
	}
	mapKeys := make([]string, len(keys))
	for i, k := range keys {
		mapKeys[i] = limiterMapKey(k.key)
		times := pruneTimes(l.failures[mapKeys[i]], cutoff)
		if len(times) == 0 {
			delete(l.failures, mapKeys[i])
		} else {
			l.failures[mapKeys[i]] = times
		}
		if len(times) >= k.max {
			return nil, false
		}
	}
	if l.global > 0 {
		l.all = append(l.all, now)
	}
	for _, key := range mapKeys {
		l.failures[key] = append(l.failures[key], now)
	}
	return &loginAttempt{l: l, keys: mapKeys, at: now}, true
}

// succeeded clears the attempt's keys. The global budget keeps the attempt.
func (a *loginAttempt) succeeded() {
	a.l.mu.Lock()
	defer a.l.mu.Unlock()
	for _, key := range a.keys {
		delete(a.l.failures, key)
	}
}

// cancel withdraws the attempt: its credentials were never judged.
func (a *loginAttempt) cancel() {
	a.l.mu.Lock()
	defer a.l.mu.Unlock()
	if a.l.global > 0 {
		a.l.all = removeTimeOnce(a.l.all, a.at)
	}
	for _, key := range a.keys {
		if times := removeTimeOnce(a.l.failures[key], a.at); len(times) == 0 {
			delete(a.l.failures, key)
		} else {
			a.l.failures[key] = times
		}
	}
}

func removeTimeOnce(times []time.Time, at time.Time) []time.Time {
	for i, t := range times {
		if t.Equal(at) {
			return append(times[:i], times[i+1:]...)
		}
	}
	return times
}

// keyCount reports how many keys are held (tests).
func (l *loginLimiter) keyCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.failures)
}
