# Feature 006: Clause Decision Actions & Undo System
## Rollback Plan

**Version**: 1.0  
**Last Updated**: 2026-02-17  
**Status**: Production-Ready

---

## Overview

This document provides procedures for rolling back Feature 006 (Clause Decision Actions & Undo System) in case of critical issues discovered in production. It covers both emergency rollback (immediate reversion) and gradual rollback (phased deprecation).

---

## Emergency Rollback Procedure

### When to Use Emergency Rollback

Trigger emergency rollback if:
- Critical data corruption in `ClauseDecision` or `AnalysisClause` tables
- Severe performance degradation (projection computation > 5s)
- Permission bypass vulnerability discovered
- Cache poisoning leading to incorrect clause states
- Escalation locks failing to enforce access control

### Emergency Rollback Steps

#### 1. Disable Feature Access (Immediate)

**Objective**: Prevent further use of decision features while preserving data

```sql
-- Option A: Revoke REVIEW_CONTRACTS permission from all roles
DELETE FROM RolePermission 
WHERE permissionId IN (
  SELECT id FROM Permission WHERE name = 'REVIEW_CONTRACTS'
);

-- Option B: Add feature flag (if implemented)
-- UPDATE SystemConfig SET value = 'false' WHERE key = 'FEATURE_006_ENABLED';
```

**Impact**: Users can view contracts but cannot apply decisions. Existing decision history remains intact.

#### 2. Revert Code Changes

```bash
# Create emergency hotfix branch
git checkout -b hotfix/revert-feature-006

# Identify the commit before Feature 006 merge
git log --oneline --grep="Feature 006" --grep="Clause Decision"

# Revert the merge commit (replace COMMIT_SHA with actual commit)
git revert -m 1 COMMIT_SHA

# Push hotfix
git push origin hotfix/revert-feature-006

# Deploy hotfix to production
npm run build
npm run start
```

**Impact**: Decision UI removed, API endpoints return 404, no new decisions can be created.

#### 3. Database Schema Rollback (Optional)

**⚠️ WARNING**: Only perform if data corruption is confirmed. This is destructive!

```sql
-- Backup first!
.backup backup_before_schema_rollback.db

-- Drop Feature 006 tables
DROP TABLE IF EXISTS ClauseDecision;
DROP TABLE IF EXISTS RolePermission;
DROP TABLE IF EXISTS Permission;

-- Revert AnalysisClause changes
ALTER TABLE AnalysisClause DROP COLUMN originalText;
ALTER TABLE AnalysisClause DROP COLUMN updatedAt;

-- Note: SQLite doesn't support DROP COLUMN; you'll need to:
-- 1. Create new table without those columns
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table
```

**Impact**: All decision history lost. Only use if data is corrupted beyond repair.

#### 4. Cache Invalidation

```bash
# Clear in-memory cache (restart server)
pm2 restart legal-ai-analyzer

# Or force cache clear via Node REPL
node -e "const { clearAllCachedProjections } = require('./dist/lib/cache'); clearAllCachedProjections();"
```

#### 5. Verify Rollback

- ✅ Decision buttons not visible in UI
- ✅ `/api/clauses/[id]/decisions` returns 404
- ✅ `/api/clauses/[id]/projection` returns 404
- ✅ Contract detail page loads without errors
- ✅ Existing analyses remain accessible

---

## Gradual Rollback Procedure

### When to Use Gradual Rollback

Use gradual rollback for:
- Non-critical bugs requiring architectural changes
- Performance issues that don't impact core workflows
- User experience issues requiring redesign

### Phase 1: Deprecation Warning (Week 1)

1. Add deprecation banner to contract detail page:
   ```tsx
   <Alert variant="warning">
     Decision actions will be temporarily unavailable starting [DATE] for 
     maintenance. Decision history will be preserved.
   </Alert>
   ```

2. Email notification to all users with `REVIEW_CONTRACTS` permission

3. Block new decision creation (read-only mode):
   ```typescript
   // In /api/clauses/[id]/decisions route
   if (!process.env.ALLOW_DECISION_WRITES) {
     return NextResponse.json(
       { error: 'Decision features are in read-only mode for maintenance' },
       { status: 503 }
     );
   }
   ```

### Phase 2: Read-Only Mode (Week 2)

1. Disable all decision buttons in UI:
   ```typescript
   const FEATURE_006_READONLY = true; // Feature flag
   ```

2. Keep decision history log visible (transparency requirement)

3. Monitor for issues:
   - Check error logs for attempts to create decisions
   - Verify projection endpoint still works for historical data
   - Confirm no data corruption during read-only period

### Phase 3: Data Export (Week 3)

Before full rollback, export decision history for audit purposes:

```bash
# Export all decisions to JSON
npx ts-node scripts/export-decision-history.ts > decisions_backup_$(date +%Y%m%d).json

# Export to CSV for analysis
sqlite3 prisma/dev.db <<EOF
.mode csv
.output decisions_export.csv
SELECT 
  cd.id,
  cd.clauseId,
  cd.userId,
  cd.actionType,
  cd.timestamp,
  cd.payload,
  u.name as userName,
  u.email as userEmail
FROM ClauseDecision cd
LEFT JOIN User u ON cd.userId = u.id
ORDER BY cd.timestamp DESC;
.quit
EOF
```

### Phase 4: Code Removal (Week 4)

1. Remove UI components:
   - `decision-buttons.tsx`
   - `decision-history-log.tsx`
   - `tracked-changes.tsx`
   - `escalate-modal.tsx`
   - `note-input.tsx`

2. Remove API routes:
   - `/api/clauses/[id]/decisions`
   - `/api/clauses/[id]/projection`

3. Remove library modules:
   - `src/lib/projection.ts`
   - `src/lib/cache.ts`
   - `src/lib/tracked-changes.ts`
   - `src/lib/permissions.ts` (review for shared usage first)

4. Remove types:
   - `src/types/decisions.ts`

### Phase 5: Schema Cleanup (Week 5+)

After confirming no issues, optionally clean up database schema:

```sql
-- Archive decisions to external storage first
.output decisions_archive.sql
.dump ClauseDecision
.dump RolePermission
.dump Permission
.output stdout

-- Then drop tables
DROP TABLE ClauseDecision;
DROP TABLE RolePermission;
DROP TABLE Permission;

-- Optionally drop columns from AnalysisClause
-- (Requires table recreation in SQLite)
```

---

## Data Preservation

### Decision History Archive

Even after rollback, preserve decision history for:
- Audit compliance
- Legal discovery requests
- Post-mortem analysis
- Potential feature restoration

**Archive Format**:
```json
{
  "exportDate": "2026-02-17T12:00:00Z",
  "feature": "006-clause-decision-actions",
  "version": "1.0",
  "decisions": [
    {
      "id": "cuid...",
      "clauseId": "cuid...",
      "userId": "cuid...",
      "actionType": "ACCEPT_DEVIATION",
      "timestamp": "2026-02-15T10:30:00Z",
      "payload": { "comment": "..." },
      "user": { "name": "...", "email": "..." }
    }
  ]
}
```

**Storage**: Store in secure, append-only storage (S3, Google Cloud Storage) with versioning enabled.

---

## Testing Rollback

### Pre-Production Rollback Test

1. Clone production database to staging
2. Execute emergency rollback steps 1-3
3. Verify:
   - No data loss in core contract analysis features
   - Decision history readable (if preserved)
   - Application stable with feature removed
4. Measure rollback time (target: < 30 minutes)

### Rollback Success Criteria

- ✅ Application builds and starts successfully
- ✅ No 500 errors in logs
- ✅ Contract upload and analysis still functional
- ✅ Existing contract analyses remain accessible
- ✅ Decision data preserved (if applicable) or backed up
- ✅ Rollback time < 30 minutes (emergency) or < 2 weeks (gradual)

---

## Communication Plan

### Internal Communication

**Emergency Rollback**:
1. Notify engineering team immediately via Slack/Teams
2. Post status page update: "Decision features temporarily unavailable"
3. Create incident report within 24 hours

**Gradual Rollback**:
1. Announce rollback plan in weekly team meeting
2. Share rollback timeline with stakeholders
3. Update project board with rollback tasks

### User Communication

**Emergency Rollback**:
```
Subject: Temporary Service Interruption - Clause Decision Features

We've temporarily disabled clause decision features due to [brief reason]. 
Your existing contract analyses and decision history are safe and accessible.

What this means:
- You can still upload and analyze contracts
- You can view existing decision history
- You cannot create new decisions until [estimated time]

We apologize for the inconvenience and are working to restore service.
```

**Gradual Rollback**:
```
Subject: Upcoming Maintenance - Clause Decision Features

We're planning maintenance on clause decision features from [DATE] to [DATE].

Timeline:
- Week 1: Feature available but with deprecation notice
- Week 2-3: Read-only mode (view decisions, no new actions)
- Week 4+: Feature offline for redesign

Your decision history will be preserved throughout this process.
```

---

## Post-Rollback Actions

1. **Root Cause Analysis**: Document what went wrong and why rollback was necessary
2. **Data Integrity Check**: Verify no corruption in core contract/analysis tables
3. **User Impact Assessment**: Survey users affected by decision feature removal
4. **Redesign Plan**: If feature will be restored, document required changes
5. **Testing Improvements**: Add regression tests to prevent similar issues

---

## Rollback Contacts

| Role | Name | Contact |
|------|------|---------|
| Engineering Lead | [Name] | [Email/Phone] |
| Database Admin | [Name] | [Email/Phone] |
| Product Owner | [Name] | [Email/Phone] |
| DevOps | [Name] | [Email/Phone] |

---

## Related Documents

- `specs/006-clause-decision-actions/spec.md` — Feature specification
- `specs/006-clause-decision-actions/plan.md` — Implementation plan
- `specs/006-clause-decision-actions/REVIEW-CHECKLIST.md` — Pre-deployment checklist
- `CLAUDE.md` — Project architecture documentation
- `.specify/memory/constitution.md` — Project principles and patterns
