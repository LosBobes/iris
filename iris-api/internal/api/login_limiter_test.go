package api

import (
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLoginLimiterWindow(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	limiter := newLoginLimiter(15*time.Minute, 2, 3)
	limiter.now = func() time.Time { return now }
	if _, ok := limiter.reserve(limiter.keys("a")...); !ok {
		t.Fatal("fresh key refused")
	}
	if _, ok := limiter.reserve(limiter.keys("a")...); !ok {
		t.Fatal("second attempt refused")
	}
	if _, ok := limiter.reserve(limiter.keys("a")...); ok {
		t.Fatal("key allowed past per-key limit")
	}
	if _, ok := limiter.reserve(limiter.keys("b")...); !ok {
		t.Fatal("other key refused before global limit")
	}
	if _, ok := limiter.reserve(limiter.keys("c")...); ok {
		t.Fatal("global limit not enforced")
	}
	now = now.Add(16 * time.Minute)
	if _, ok := limiter.reserve(limiter.keys("a")...); !ok {
		t.Fatal("key still refused after the window")
	}
}

func TestLoginLimiterSettle(t *testing.T) {
	limiter := newLoginLimiter(time.Minute, 2, 0)
	for i := 0; i < 5; i++ {
		attempt, ok := limiter.reserve(limiter.keys("k")...)
		if !ok {
			t.Fatalf("cancelled attempts still counted (attempt %d refused)", i)
		}
		attempt.cancel()
	}
	if n := limiter.keyCount(); n != 0 {
		t.Fatalf("keys after cancel = %d, want 0", n)
	}
	limiter.reserve(limiter.keys("k")...)
	attempt, _ := limiter.reserve(limiter.keys("k")...)
	attempt.succeeded()
	if _, ok := limiter.reserve(limiter.keys("k")...); !ok {
		t.Fatal("success did not clear the key")
	}
}

// TestLoginLimiterConcurrentReserve: concurrent attempts cannot all pass the
// check before any is counted.
func TestLoginLimiterConcurrentReserve(t *testing.T) {
	limiter := newLoginLimiter(time.Minute, 5, 0)
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, ok := limiter.reserve(limiter.keys("victim")...); ok {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if allowed != 5 {
		t.Fatalf("allowed %d concurrent attempts, want 5", allowed)
	}
}

func TestLoginLimiterSweepsExpiredKeys(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	limiter := newLoginLimiter(15*time.Minute, 5, 0)
	limiter.now = func() time.Time { return now }
	for i := 0; i < 500; i++ {
		limiter.reserve(limiter.keys("user-" + time.Duration(i).String())...)
	}
	if n := limiter.keyCount(); n != 500 {
		t.Fatalf("keys = %d, want 500", n)
	}
	now = now.Add(16 * time.Minute)
	limiter.reserve(limiter.keys("fresh")...)
	if n := limiter.keyCount(); n != 1 {
		t.Fatalf("keys after the window = %d, want 1 (expired keys swept)", n)
	}

	// Past the size threshold a sweep runs without waiting for the window.
	for i := 0; i < limiterSweepKeys-1; i++ {
		limiter.reserve(limiter.keys("bulk-" + time.Duration(i).String())...)
	}
	now = now.Add(16 * time.Minute)
	limiter.lastSweep = now
	limiter.reserve(limiter.keys("trigger")...)
	if n := limiter.keyCount(); n != 1 {
		t.Fatalf("keys after size-triggered sweep = %d, want 1", n)
	}
}

func TestLoginLimiterCapsKeyLength(t *testing.T) {
	limiter := newLoginLimiter(time.Minute, 1, 0)
	long := "account:" + strings.Repeat("u", 10000)
	limiter.reserve(limiter.keys(long)...)
	if _, ok := limiter.reserve(limiter.keys(long)...); ok {
		t.Fatal("hashed long key not limited")
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	for key := range limiter.failures {
		if len(key) > maxLimiterKeyLen {
			t.Fatalf("stored key is %d bytes, want <= %d", len(key), maxLimiterKeyLen)
		}
	}
}
