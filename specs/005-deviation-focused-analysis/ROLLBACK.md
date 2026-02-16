# Rollback Plan: Deviation-Focused Contract Analysis

**Feature**: 005-deviation-focused-analysis  
**Date**: 2026-02-16

## Quick Rollback (Emergency)

If the new format causes issues in production, follow these steps to immediately revert to the old format:

### Step 1: Revert Prompt Changes

**File**: `src/lib/prompts.ts`

Change line ~66-117 back to the original prompt that requests full clause text:

```typescript
// ROLLBACK: Change this section back to requesting full clauseText
// instead of flat findings with excerpts
```

**Key change**: Replace the "deviation-focused" prompt section with the original clause-grouped prompt that includes:
- `"clauseText": "string — the FULL clause text..."`
- `"clauses": [...]` array structure
- Remove instructions about excerpts, context, and location

### Step 2: Force formatVersion=1 in API

**File**: `src/app/api/contracts/[id]/analyze/route.ts`

Line ~250: Change `formatVersion: 2` to `formatVersion: 1`

```typescript
// ROLLBACK: Force v1 format
formatVersion: 1,  // Change from 2 to 1
totalClauses: 0,   // Set to 0 for v1
```

### Step 3: Restart Application

```bash
# Restart the Next.js server to apply changes
pm2 restart legal-ai-analyzer
# or
npm run build && npm start
```

### Step 4: Verify Rollback

1. Trigger a new analysis on a test contract
2. Check logs for `[Parser] Detected format v1 (clause-grouped)`
3. Verify database shows `formatVersion=1` in `ContractAnalysis` table
4. Verify UI displays full clause text (not just excerpts)

---

## What Does NOT Need Rollback

The following changes are **backward compatible** and can remain:

✅ **Database Schema**: New fields (`formatVersion`, `totalClauses`, `contextBefore`, etc.) can stay  
- Old analyses work fine with these fields  
- New fields are nullable and have defaults

✅ **Parser**: Dual-format parser can stay  
- Already handles both v1 and v2 formats  
- Will automatically use v1 parser when prompt reverted

✅ **UI Components**: Can stay  
- Already detect format and display appropriately  
- Will show full clause text for v1, excerpts for v2

---

## Gradual Rollback (If More Time Available)

If you have time for a more thorough rollback:

### 1. Revert Prompt (src/lib/prompts.ts)

```bash
git checkout HEAD~1 -- src/lib/prompts.ts
```

### 2. Revert API Route Changes (src/app/api/contracts/[id]/analyze/route.ts)

Keep the lenient validation logging, but change:
- `formatVersion: 2` → `formatVersion: 1`
- `totalClauses: parsed.totalClauses || 0` → `totalClauses: 0`

### 3. Revert Skill Instructions (skills/contract-review.md)

```bash
git checkout HEAD~1 -- skills/contract-review.md
```

### 4. Test Thoroughly

- Run 3-5 test analyses
- Verify token usage is back to ~15K per analysis
- Verify UI displays correctly
- Check logs for any errors

---

## Monitoring After Rollback

Monitor these metrics for 1 hour after rollback:

- **Format Version Distribution**: Should be 100% v1  
  ```sql
  SELECT formatVersion, COUNT(*) FROM ContractAnalysis GROUP BY formatVersion;
  ```

- **Token Usage**: Should be back to ~15K per analysis  
  Check logs for: `[Analysis] Completed for contract`

- **Error Rate**: Should match pre-deployment baseline  
  Check logs for: `[Analyze] Background analysis failed`

- **User Complaints**: Monitor support channels

---

## Re-Deployment After Fix

If rolling back to fix an issue, before re-deploying:

1. **Identify Root Cause**: What caused the rollback?
2. **Fix Issue**: Update code to address root cause
3. **Test Locally**: Run full test suite (Phase 8 tasks)
4. **Stage Test**: Deploy to staging environment first
5. **Monitor Staging**: 24 hours of monitoring
6. **Re-Deploy Production**: Only after staging is stable

---

## Contact

For questions or issues with rollback:
- Check logs: `pm2 logs legal-ai-analyzer`
- Review error details in application logs
- Consult this rollback plan
- Review original spec: `specs/005-deviation-focused-analysis/spec.md`

---

## Rollback Checklist

- [ ] Prompt reverted to request full clauseText
- [ ] API route set to formatVersion=1
- [ ] Application restarted
- [ ] Test analysis triggered and verified as v1
- [ ] Logs show format v1 detection
- [ ] Database shows formatVersion=1 for new analyses
- [ ] UI displays full clause text
- [ ] Token usage back to ~15K
- [ ] Error rate normal
- [ ] User experience normal
- [ ] Support team notified of rollback
- [ ] Root cause investigation started

---

**Last Updated**: 2026-02-16  
**Status**: Ready for use if needed
