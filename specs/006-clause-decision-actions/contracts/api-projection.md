# API Contract: Clause Projection (Cached)

**Feature**: 006-clause-decision-actions  
**Endpoint**: `/api/clauses/[id]/projection`  
**Purpose**: Retrieve cached projection result for a clause (effective text, status, tracked changes)

---

## GET /api/clauses/[id]/projection

**Purpose**: Get the computed projection result for a clause. Returns cached result if available (< 1ms), otherwise computes on-the-fly (< 100ms) and caches for future reads.

### Authentication

**Required**: Yes (NextAuth session)

**Roles**: All roles can read projections (no restrictions per FR-046)

### Request

**Path Parameters**:
- `id` (string, required): Clause ID (UUID from `AnalysisClause.id`)

**Query Parameters**:
- `bypassCache` (boolean, optional): If `true`, force recompute projection (for debugging cache issues). Default: `false`.

**Example**:
```
GET /api/clauses/clause_abc123/projection
GET /api/clauses/clause_abc123/projection?bypassCache=true
```

### Response

**Success (200 OK)**:

```json
{
  "projection": {
    "clauseId": "clause_abc123",
    "effectiveText": "Both parties shall indemnify each other for damages arising from...",
    "effectiveStatus": "RESOLVED_MANUAL_EDIT",
    "trackedChanges": [
      {
        "type": "delete",
        "text": "Licensee shall not",
        "position": 0
      },
      {
        "type": "insert",
        "text": "Both parties shall",
        "position": 1
      },
      {
        "type": "equal",
        "text": " indemnify",
        "position": 2
      },
      {
        "type": "insert",
        "text": " each other",
        "position": 3
      },
      {
        "type": "equal",
        "text": " for damages arising from...",
        "position": 4
      }
    ],
    "lastDecisionTimestamp": "2026-02-16T10:25:00.000Z",
    "decisionCount": 3,
    "escalatedTo": null,
    "hasConflict": false
  },
  "cacheInfo": {
    "cacheHit": true,
    "computedAt": "2026-02-16T10:26:00.000Z",
    "computationTimeMs": 0.5
  }
}
```

**Success (200 OK) - Cache Miss**:

```json
{
  "projection": {
    "clauseId": "clause_abc123",
    "effectiveText": "...",
    "effectiveStatus": "ACCEPTED",
    "trackedChanges": [],
    "lastDecisionTimestamp": "2026-02-16T10:20:00.000Z",
    "decisionCount": 1,
    "escalatedTo": null,
    "hasConflict": false
  },
  "cacheInfo": {
    "cacheHit": false,
    "computedAt": "2026-02-16T10:27:15.234Z",
    "computationTimeMs": 87.5
  }
}
```

**Error Responses**:

| Status | Error Message | Cause |
|--------|---------------|-------|
| 401 Unauthorized | `{ "error": "Unauthorized" }` | No valid session |
| 404 Not Found | `{ "error": "Clause not found" }` | Invalid clause ID |
| 500 Internal Server Error | `{ "error": "Failed to compute projection" }` | Projection algorithm error or database failure |

### Response Schema

```typescript
interface ProjectionResponse {
  projection: ProjectionResult;
  cacheInfo: CacheInfo;
}

interface ProjectionResult {
  clauseId: string;
  effectiveText: string;              // Final text after applying all active decisions
  effectiveStatus: ClauseStatus;      // Final status (ACCEPTED, ESCALATED, etc.)
  trackedChanges: TrackedChange[];    // Diffs for UI rendering
  lastDecisionTimestamp: Date | null; // When last decision was made (null if no decisions)
  decisionCount: number;              // Number of active (not undone) decisions
  escalatedTo: string | null;         // User ID if escalated, null otherwise
  hasConflict: boolean;               // True if conflicting decisions detected (future enhancement)
}

type ClauseStatus =
  | 'DEVIATION_DETECTED'           // Initial state (no decisions yet)
  | 'ACCEPTED'                     // After ACCEPT_DEVIATION
  | 'RESOLVED_APPLIED_FALLBACK'   // After APPLY_FALLBACK
  | 'RESOLVED_MANUAL_EDIT'        // After EDIT_MANUAL
  | 'ESCALATED';                   // After ESCALATE

interface TrackedChange {
  type: 'insert' | 'delete' | 'equal';
  text: string;                    // Text fragment
  position: number;                // Order in diff sequence
}

interface CacheInfo {
  cacheHit: boolean;               // True if served from cache, false if computed
  computedAt: Date;                // When projection was computed (cache entry timestamp)
  computationTimeMs: number;       // How long computation took (0.5ms for cache hit, ~100ms for miss)
}
```

### Business Logic

**Step 1: Authentication**
1. Check NextAuth session exists
2. Any role can read projections (no permission check needed)

**Step 2: Check Cache** (FR-040, FR-042)
1. If `bypassCache=true` → skip to Step 4 (recompute)
2. Call `getCachedProjection(clauseId)`:
   - Check in-memory Map for `clauseId` key
   - Check TTL (5 min backup, per Risk #6 mitigation)
   - If found and valid → return cached result (cache hit)
   - If not found or expired → cache miss, proceed to Step 3

**Step 3: Load Clause and Decisions** (on cache miss)
1. Load `AnalysisClause` with `id`, `originalText` from database
2. Load all `ClauseDecision` records for `clauseId`, ordered by `timestamp ASC`
3. Include related `user` data (for escalatedTo name resolution)

**Step 4: Compute Projection** (FR-043)
1. Run projection algorithm (see `data-model.md` for pseudocode):
   - Initialize with `originalText` and `DEVIATION_DETECTED` status
   - Replay decisions chronologically
   - Handle UNDO (skip undone decisions) and REVERT (clear prior decisions)
   - Apply text replacements for APPLY_FALLBACK and EDIT_MANUAL
   - Update status based on action types
2. Compute tracked changes using `diff-match-patch`:
   - Diff `originalText` vs `effectiveText`
   - Semantic cleanup for human-readable diffs
   - Map to `{ type, text, position }` array
3. Build `ProjectionResult` object

**Step 5: Update Cache** (FR-040)
1. Store projection result in in-memory Map:
   ```typescript
   projectionCache.set(clauseId, {
     result: projectionResult,
     timestamp: Date.now()
   });
   ```
2. Track metrics: cache size, computation time

**Step 6: Return Response**
1. Return projection result with cache info
2. Log cache hit/miss for monitoring (target: 80%+ hit rate per NFR-013)

### Performance

**Target Response Time**:
- **Cache Hit**: < 1ms (NFR-002 clarification)
- **Cache Miss**: < 100ms for 100 decisions (NFR-002)

**Breakdown (Cache Miss)**:
- Authentication: < 10ms (session lookup)
- Load clause: < 20ms (indexed query)
- Load decisions: < 50ms (indexed by `clauseId, timestamp`)
- Compute projection: < 50ms (replay + diff)
- Cache write: < 1ms (in-memory Map)
- Total: < 131ms (within 500ms budget per NFR-001)

**Cache Hit Rate Target**: ≥ 80% (NFR-013)

**Cache TTL**: 5 minutes (backup for invalidation bugs, per Risk #6 mitigation)

### Caching Behavior

**Cache Invalidation Triggers** (FR-041):
- POST /api/clauses/[id]/decisions → Invalidate cache for `clauseId`
- Any write to `ClauseDecision` table for this clause → Invalidate

**Cache Coherence**:
- Single Next.js process → Deterministic cache (no distributed cache issues)
- Defensive TTL (5 min) → Automatic recovery from invalidation bugs
- `bypassCache` param → Manual override for debugging

**Cache Metrics** (for monitoring):
- Hit rate: hits / (hits + misses)
- Cache size: Number of entries (cap at 10,000)
- Avg computation time (cache miss): Track projection algorithm performance

### Example cURL Request

**Normal request (use cache)**:
```bash
curl -X GET http://localhost:3000/api/clauses/clause_abc123/projection \
  -H "Cookie: next-auth.session-token=..."
```

**Bypass cache (force recompute)**:
```bash
curl -X GET http://localhost:3000/api/clauses/clause_abc123/projection?bypassCache=true \
  -H "Cookie: next-auth.session-token=..."
```

### Security Considerations

1. **No permission checks**: All authenticated users can read projections (per FR-046: full transparency)
2. **Cache poisoning prevention**: Cache invalidated on every write (no stale data served)
3. **DoS mitigation**: Cache prevents repeated expensive computations (attacker would need valid session)
4. **Memory leak prevention**: Cache size capped at 10,000 entries (~10MB)

### UI Integration

**Usage Pattern**:
1. **Clause List Page**: Load projections for all visible clauses (batch request or individual):
   ```typescript
   const projections = await Promise.all(
     clauses.map(clause => 
       fetch(`/api/clauses/${clause.id}/projection`).then(r => r.json())
     )
   );
   ```
2. **Clause Detail Page**: Load projection once on mount, revalidate on decision actions:
   ```typescript
   const { projection, cacheInfo } = await fetch(`/api/clauses/${clauseId}/projection`).then(r => r.json());
   ```
3. **After Decision Action**: Projection returned in POST /api/clauses/[id]/decisions response (no separate request needed)

**Cache Hit Optimization**:
- Load clause list → All projections cached
- Navigate to clause detail → Cache hit (already loaded)
- Make decision → Cache invalidated, recomputed, cached again
- Reload clause detail → Cache hit (just recomputed)

**Expected Hit Rate**: 80-90% in typical usage (multiple reads between writes)

### Testing Scenarios

**Happy Path**:
1. First load → Cache miss, projection computed and cached, `cacheHit: false`
2. Second load → Cache hit, `cacheHit: true`, < 1ms response time
3. Make decision → Cache invalidated
4. Third load → Cache miss, recomputed with new decision, `cacheHit: false`

**Cache Bypass**:
1. Load with `bypassCache=true` → Always cache miss, `cacheHit: false`
2. Verify cache not updated (next normal request still hits old cache or misses)

**TTL Expiry**:
1. Load clause → Cached
2. Wait 6 minutes (past 5 min TTL)
3. Load again → Cache miss (TTL expired), recomputed

**Performance**:
1. Clause with 100 decisions → Compute < 100ms (cache miss)
2. Clause with 1 decision → Compute < 10ms (cache miss)
3. Any clause → Serve < 1ms (cache hit)

### Monitoring & Alerting

**Metrics to Track**:
- Cache hit rate: `hits / (hits + misses)` → Alert if < 70% (target: 80%+)
- Avg computation time (miss): Track p50, p95, p99 → Alert if p95 > 200ms
- Cache size: Track entry count → Alert if > 8,000 (approaching 10K cap)
- Projection errors: Count 500 errors → Alert if > 1% error rate

**Logs**:
```typescript
console.log(`[Projection] ${cacheHit ? 'HIT' : 'MISS'} clauseId=${clauseId} computeTime=${computationTimeMs}ms`);
```

---

**API Contracts Complete**: All three endpoints specified (decisions POST, decisions GET, projection GET).

