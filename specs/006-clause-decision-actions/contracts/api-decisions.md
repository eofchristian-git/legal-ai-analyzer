# API Contract: Clause Decisions

**Feature**: 006-clause-decision-actions  
**Endpoint**: `/api/clauses/[id]/decisions`  
**Purpose**: Apply decision actions to clauses and retrieve decision history

---

## POST /api/clauses/[id]/decisions

**Purpose**: Apply a decision action to a clause (accept, replace, edit, escalate, note, undo, revert).

### Authentication

**Required**: Yes (NextAuth session)

**Permissions** (role-based access via `RolePermission` table):
- `REVIEW_CONTRACTS`: Required to access contract analysis and make clause decisions. Legal role has this permission; compliance role does NOT.
- `APPROVE_ESCALATIONS`: Required to resolve escalations when assigned. Legal role has this permission by default (can be removed for junior reviewers in future).
- `role = "admin"`: Bypasses all permission checks (code-level fallback). Can override escalation locks and make decisions on any clause.

### Request

**Path Parameters**:
- `id` (string, required): Clause ID (UUID from `AnalysisClause.id`)

**Query Parameters**: None

**Request Body** (JSON):

```typescript
interface ApplyDecisionRequest {
  actionType: DecisionActionType;
  payload: ClauseDecisionPayload;
  clauseUpdatedAtWhenLoaded: string; // ISO 8601 timestamp for conflict detection
}

type DecisionActionType =
  | 'ACCEPT_DEVIATION'
  | 'APPLY_FALLBACK'
  | 'EDIT_MANUAL'
  | 'ESCALATE'
  | 'ADD_NOTE'
  | 'UNDO'
  | 'REVERT';
```

**Payload Examples by Action Type**:

**1. ACCEPT_DEVIATION**:
```json
{
  "actionType": "ACCEPT_DEVIATION",
  "payload": {
    "comment": "Risk acceptable for this client relationship"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**2. APPLY_FALLBACK**:
```json
{
  "actionType": "APPLY_FALLBACK",
  "payload": {
    "replacementText": "Licensee shall indemnify Licensor...",
    "source": "fallback",
    "playbookRuleId": "clxxx123"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**3. EDIT_MANUAL**:
```json
{
  "actionType": "EDIT_MANUAL",
  "payload": {
    "replacementText": "Both parties shall indemnify each other..."
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**4. ESCALATE**:
```json
{
  "actionType": "ESCALATE",
  "payload": {
    "reason": "Exceeds tolerance",
    "comment": "Unlimited liability clause - requires VP approval",
    "assigneeId": "user_abc123"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**5. ADD_NOTE**:
```json
{
  "actionType": "ADD_NOTE",
  "payload": {
    "noteText": "Discuss with finance team before finalizing"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**6. UNDO** (undo last decision):
```json
{
  "actionType": "UNDO",
  "payload": {
    "undoneDecisionId": "cldec_xyz789"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

**7. REVERT** (revert to original):
```json
{
  "actionType": "REVERT",
  "payload": {},
  "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
}
```

### Response

**Success (201 Created)**:

```json
{
  "decision": {
    "id": "cldec_xyz789",
    "clauseId": "clause_abc123",
    "userId": "user_def456",
    "actionType": "ACCEPT_DEVIATION",
    "timestamp": "2026-02-16T10:32:15.234Z",
    "payload": {
      "comment": "Risk acceptable for this client relationship"
    }
  },
  "updatedProjection": {
    "clauseId": "clause_abc123",
    "effectiveText": "Licensee shall not...",
    "effectiveStatus": "ACCEPTED",
    "trackedChanges": [],
    "lastDecisionTimestamp": "2026-02-16T10:32:15.234Z",
    "decisionCount": 1,
    "escalatedTo": null,
    "hasConflict": false
  },
  "conflictWarning": null
}
```

**Success with Conflict Warning (201 Created)**:

```json
{
  "decision": { /* ... decision object ... */ },
  "updatedProjection": { /* ... projection object ... */ },
  "conflictWarning": {
    "message": "This clause was updated by Jane Smith while you were editing. Your change was saved but may conflict.",
    "lastUpdatedBy": "Jane Smith",
    "lastUpdatedAt": "2026-02-16T10:31:45.123Z"
  }
}
```

**Error Responses**:

| Status | Error Message | Cause |
|--------|---------------|-------|
| 401 Unauthorized | `{ "error": "Unauthorized" }` | No valid session |
| 403 Forbidden | `{ "error": "Cannot make decisions on escalated clauses unless assigned or admin" }` | User lacks permission (escalation lock) |
| 404 Not Found | `{ "error": "Clause not found" }` | Invalid clause ID |
| 400 Bad Request | `{ "error": "Invalid actionType" }` | Unknown action type |
| 400 Bad Request | `{ "error": "Invalid payload for ACCEPT_DEVIATION" }` | Payload doesn't match action type schema |
| 500 Internal Server Error | `{ "error": "Failed to apply decision" }` | Database error or projection computation failure |

### Business Logic

**Step 1: Authentication**
1. Check NextAuth session exists
2. Extract `userId` and `role` from session

**Step 2: Authorization**
1. Load clause from database with `updatedAt` field
2. Compute current projection to determine `effectiveStatus` and `escalatedTo`
3. Check permission using RBAC rules:
   - If clause is `ESCALATED` and user is not assigned approver or admin → 403 Forbidden
   - Otherwise → allow decision

**Step 3: Conflict Detection** (FR-035)
1. Compare `clauseUpdatedAtWhenLoaded` (from request) with `clause.updatedAt` (from database)
2. If `clauseUpdatedAtWhenLoaded < clause.updatedAt` → stale state detected
3. Load last decision to get `lastUpdatedBy` user name
4. Build `conflictWarning` object (decision still saved, warning returned to client)

**Step 4: Payload Validation**
1. Validate payload structure matches action type schema
2. For `ESCALATE`: Validate `assigneeId` exists and has `APPROVER` or `ADMIN` role
3. For `APPLY_FALLBACK`: Validate `playbookRuleId` exists
4. For `UNDO`: Validate `undoneDecisionId` exists and belongs to same clause

**Step 5: Save Decision**
1. Create `ClauseDecision` record with `userId`, `timestamp` (database-generated), `actionType`, `payload`
2. Transaction ensures atomicity

**Step 6: Cache Invalidation** (FR-041)
1. Invalidate projection cache for `clauseId`
2. Ensure cache coherence (defensive TTL backup)

**Step 7: Compute Updated Projection**
1. Load all decisions for clause (including newly created one)
2. Run projection algorithm to compute effective state
3. Cache result for future reads

**Step 8: Return Response**
1. Return decision object, updated projection, and conflict warning (if any)
2. Client displays warning toast if `conflictWarning` is not null

### Performance

**Target Response Time**: < 500ms (NFR-001)

**Breakdown**:
- Authentication: < 10ms (session lookup)
- Authorization: < 20ms (clause load + projection from cache)
- Conflict detection: < 5ms (timestamp comparison)
- Payload validation: < 5ms (JSON schema validation)
- Database write: < 50ms (single insert)
- Cache invalidation: < 1ms (in-memory delete)
- Projection computation: < 100ms (replay 100 decisions + diff)
- Total: < 191ms (well under 500ms budget)

**Cache Hit Rate**: 80%+ on clause load (NFR-013)

### Example cURL Request

```bash
curl -X POST http://localhost:3000/api/clauses/clause_abc123/decisions \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "actionType": "ACCEPT_DEVIATION",
    "payload": {
      "comment": "Risk acceptable for this client relationship"
    },
    "clauseUpdatedAtWhenLoaded": "2026-02-16T10:30:00.000Z"
  }'
```

### Security Considerations

1. **API-level enforcement**: Escalation locks checked in API route, not just UI (NFR-009)
2. **Timestamp immutability**: `timestamp` generated server-side (database `now()`), not client-provided
3. **Admin override audit**: `isAdminOverride` flag set in payload when admin resolves escalated clause (NFR-014)
4. **SQL injection prevention**: Prisma ORM parameterizes all queries
5. **CSRF protection**: NextAuth provides CSRF tokens

### Testing Scenarios

**Happy Path**:
1. Reviewer accepts deviation on non-escalated clause → 201 Created with ACCEPTED status
2. Reviewer replaces with fallback → 201 Created with tracked changes showing diff
3. Approver resolves escalated clause → 201 Created with escalation cleared

**Error Cases**:
1. Reviewer tries to edit escalated clause (not assigned) → 403 Forbidden
2. Invalid clause ID → 404 Not Found
3. Missing required payload field → 400 Bad Request
4. Undo with non-existent decision ID → 400 Bad Request

**Conflict Cases**:
1. Two reviewers click "Accept" simultaneously → Both 201 Created, second gets conflict warning
2. Reviewer edits while approver escalates → Second action gets conflict warning

---

## GET /api/clauses/[id]/decisions

**Purpose**: Retrieve decision history for a clause (for display in history log).

### Authentication

**Required**: Yes (NextAuth session)

**Roles**: All roles can view decision history (full transparency per FR-046, NFR-015)

### Request

**Path Parameters**:
- `id` (string, required): Clause ID (UUID from `AnalysisClause.id`)

**Query Parameters** (optional filters, FR-034):
- `actionType` (string, optional): Filter by action type (e.g., `ESCALATE`)
- `userId` (string, optional): Filter by user ID
- `startDate` (string, optional): ISO 8601 timestamp (inclusive)
- `endDate` (string, optional): ISO 8601 timestamp (inclusive)

**Example**:
```
GET /api/clauses/clause_abc123/decisions?actionType=ESCALATE&startDate=2026-02-01T00:00:00Z
```

### Response

**Success (200 OK)**:

```json
{
  "decisions": [
    {
      "id": "cldec_001",
      "clauseId": "clause_abc123",
      "userId": "user_jane",
      "actionType": "APPLY_FALLBACK",
      "timestamp": "2026-02-16T10:15:00.000Z",
      "payload": {
        "replacementText": "Licensee shall indemnify...",
        "source": "fallback",
        "playbookRuleId": "rule_xyz"
      },
      "user": {
        "name": "Jane Smith",
        "role": "REVIEWER"
      },
      "isUndone": false
    },
    {
      "id": "cldec_002",
      "clauseId": "clause_abc123",
      "userId": "user_john",
      "actionType": "UNDO",
      "timestamp": "2026-02-16T10:20:00.000Z",
      "payload": {
        "undoneDecisionId": "cldec_001"
      },
      "user": {
        "name": "John Doe",
        "role": "APPROVER"
      },
      "isUndone": false
    },
    {
      "id": "cldec_003",
      "clauseId": "clause_abc123",
      "userId": "user_jane",
      "actionType": "EDIT_MANUAL",
      "timestamp": "2026-02-16T10:25:00.000Z",
      "payload": {
        "replacementText": "Both parties shall..."
      },
      "user": {
        "name": "Jane Smith",
        "role": "REVIEWER"
      },
      "isUndone": false
    }
  ],
  "clauseInfo": {
    "id": "clause_abc123",
    "clauseNumber": "3.1",
    "clauseName": "Indemnification",
    "originalText": "Licensee shall not indemnify...",
    "currentEffectiveText": "Both parties shall...",
    "currentEffectiveStatus": "RESOLVED_MANUAL_EDIT"
  },
  "totalCount": 3,
  "filteredCount": 3
}
```

**Error Responses**:

| Status | Error Message | Cause |
|--------|---------------|-------|
| 401 Unauthorized | `{ "error": "Unauthorized" }` | No valid session |
| 404 Not Found | `{ "error": "Clause not found" }` | Invalid clause ID |
| 400 Bad Request | `{ "error": "Invalid actionType filter" }` | Unknown action type in filter |

### Business Logic

**Step 1: Authentication**
1. Check NextAuth session exists (any role can view history per FR-046)

**Step 2: Load Decisions**
1. Query `ClauseDecision` table with filters:
   - `WHERE clauseId = :id`
   - `AND actionType = :actionType` (if provided)
   - `AND userId = :userId` (if provided)
   - `AND timestamp >= :startDate` (if provided)
   - `AND timestamp <= :endDate` (if provided)
2. Order by `timestamp ASC` (chronological)
3. Include related `user` data (name, role) via Prisma include

**Step 3: Mark Undone Decisions** (FR-032)
1. For each decision, check if any later UNDO action references it
2. Set `isUndone: true` if undone (for UI strikethrough/label)

**Step 4: Load Clause Info**
1. Load clause details (`clauseNumber`, `clauseName`, `originalText`)
2. Compute current projection to get `currentEffectiveText` and `currentEffectiveStatus`

**Step 5: Return Response**
1. Return decisions array with user info and `isUndone` flag
2. Return clause info for context
3. Return counts for pagination (future enhancement)

### Performance

**Target Response Time**: < 1 second for 50 decisions (NFR-003)

**Breakdown**:
- Authentication: < 10ms
- Database query: < 200ms (indexed by `clauseId, timestamp`)
- Mark undone decisions: < 100ms (in-memory check)
- Load clause info: < 100ms (single query + cached projection)
- Total: < 410ms (well under 1 second)

### Example cURL Request

```bash
curl -X GET "http://localhost:3000/api/clauses/clause_abc123/decisions?actionType=ESCALATE" \
  -H "Cookie: next-auth.session-token=..."
```

### Security Considerations

1. **Full transparency**: No role-based filtering of decisions (FR-046, NFR-015)
2. **Contract-level access control**: If user can view contract, they can view all decision history
3. **No sensitive data redaction**: Comments, escalation reasons, notes visible to all (per Clarification #5)

### UI Integration

**Decision History Log Component** displays:
- Chronological list of all decisions
- User name, action type, timestamp for each
- Strikethrough or "UNDONE" label for undone decisions
- Expandable payload details (comments, escalation reason, etc.)
- Filter dropdowns for action type, user, date range

---

**Contracts Complete**: Decision apply and history retrieval endpoints specified.

