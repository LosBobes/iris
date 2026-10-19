package store

import (
	"sync"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// metaCacheTTL is the belt-and-braces expiry for cached per-tenant metadata.
// Every in-process write path invalidates explicitly; the TTL only bounds
// staleness when another process (e.g. irisctl) writes to the same database.
const metaCacheTTL = 30 * time.Second

type metaCacheEntry[T any] struct {
	value   T
	expires time.Time
}

// tenantCache is a small tenant-keyed, concurrency-safe value cache.
type tenantCache[T any] struct {
	mu      sync.Mutex
	entries map[string]metaCacheEntry[T]
	// gen is bumped by every invalidation so a load that raced with a write
	// (and may have read pre-write data) is not stored.
	gen   map[string]uint64
	epoch uint64 // bumped by invalidateAll
}

type cacheGen struct{ tenant, epoch uint64 }

func (c *tenantCache[T]) get(tenantID string) (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[tenantID]
	if !ok || time.Now().After(entry.expires) {
		var zero T
		return zero, false
	}
	return entry.value, true
}

// generation returns the tenant's invalidation counter; read it before loading.
func (c *tenantCache[T]) generation(tenantID string) cacheGen {
	c.mu.Lock()
	defer c.mu.Unlock()
	return cacheGen{c.gen[tenantID], c.epoch}
}

// put stores value only if the tenant was not invalidated since gen was read.
func (c *tenantCache[T]) put(tenantID string, gen cacheGen, value T) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if (cacheGen{c.gen[tenantID], c.epoch}) != gen {
		return
	}
	if c.entries == nil {
		c.entries = map[string]metaCacheEntry[T]{}
	}
	c.entries[tenantID] = metaCacheEntry[T]{value: value, expires: time.Now().Add(metaCacheTTL)}
}

func (c *tenantCache[T]) invalidate(tenantID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, tenantID)
	if c.gen == nil {
		c.gen = map[string]uint64{}
	}
	c.gen[tenantID]++
}

// metaCaches holds the per-tenant caches of the read-mostly metadata the hot
// request paths (module gates, print preview, validation) keep re-reading.
type metaCaches struct {
	settings tenantCache[domain.OrganizationSettings]
	enums    tenantCache[[]domain.EnumValue]
}

// invalidateSettings drops the tenant's cached organization settings. Call after
// any write to app_settings keys that feed OrganizationSettings (settings,
// modules, login logo).
func (s *SQLiteStore) invalidateSettings(tenantID string) {
	s.caches.settings.invalidate(tenantID)
}

// invalidateEnums drops the tenant's cached enum values. Call after enum CRUD
// (EnumValues merges only stored custom values; catalog units feed validation, not this list).
func (s *SQLiteStore) invalidateEnums(tenantID string) {
	s.caches.enums.invalidate(tenantID)
}

func cloneSettings(settings domain.OrganizationSettings) domain.OrganizationSettings {
	settings.PrintItemColumns = append([]domain.PrintItemColumn(nil), settings.PrintItemColumns...)
	settings.SellerIdentity = cloneSellerIdentity(settings.SellerIdentity)
	return settings
}

func (c *tenantCache[T]) invalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
	c.epoch++
}
