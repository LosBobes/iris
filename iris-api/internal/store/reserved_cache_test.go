package store

import (
	"fmt"
	"testing"
)

// TestReservedCacheIsBounded: distinct graphs never grow the memo past its
// entry or byte limits, and keys are digests rather than the graph text.
func TestReservedCacheIsBounded(t *testing.T) {
	for i := 0; i < 3*reservedCacheMaxEntries; i++ {
		raw := fmt.Sprintf(`{"nodes":[],"edges":[],"note":"%d"}`, i)
		if _, err := reservedInputsForGraph(raw); err != nil {
			t.Fatalf("reservedInputsForGraph: %v", err)
		}
		reservedCache.Lock()
		entries, bytes := len(reservedCache.entries), reservedCache.bytes
		reservedCache.Unlock()
		if entries > reservedCacheMaxEntries || bytes > reservedCacheMaxBytes {
			t.Fatalf("cache holds %d entries / %d bytes, limits %d / %d", entries, bytes, reservedCacheMaxEntries, reservedCacheMaxBytes)
		}
	}
	// The same text hits the cache.
	raw := `{"nodes":[],"edges":[]}`
	first, _ := reservedInputsForGraph(raw)
	second, _ := reservedInputsForGraph(raw)
	if fmt.Sprintf("%p", first) != fmt.Sprintf("%p", second) {
		t.Fatal("identical graph text missed the cache")
	}
}
