# Feature 011: Per-Finding Decision Actions

**Status**: 📋 Spec Draft  
**Priority**: P2 (Post-MVP Enhancement)  
**Depends On**: Feature 006 (Clause Decision Actions & Undo System)

---

## 🎯 What This Feature Does

Enables contract reviewers to make **granular decisions on individual findings** within a clause, rather than operating at the clause level only.

### Example Scenario

**Clause**: "Indemnification - Unlimited liability with 5-day notice"

**3 Findings**:
- 🔴 **Finding A**: Unlimited liability → Apply fallback ($1M cap)
- 🟡 **Finding B**: Short notice period → Accept (business approved)
- 🟢 **Finding C**: Minor wording → Add note (fix later)

**Current System (Feature 006)**: One button click = one clause-level decision  
**This Feature (011)**: Each finding has its own action buttons

---

## 📁 Documentation

- **[spec.md](./spec.md)** - Full feature specification with user stories, requirements, and technical design
- **plan.md** - Implementation plan (to be created)
- **tasks.md** - Detailed task breakdown (to be created)
- **data-model.md** - Database schema changes (to be created)

---

## 🔑 Key Capabilities

### For Users
✅ Accept/escalate/note individual findings  
✅ Choose which finding's fallback to apply  
✅ Undo specific finding's decision without affecting others  
✅ Revert all decisions on a specific finding  
✅ Clear audit trail showing which finding prompted which action  

### For Developers
✅ Backward compatible with Feature 006 (clause-level decisions)  
✅ Optional `findingId` field in `ClauseDecision`  
✅ Enhanced projection algorithm handles both modes  
✅ Zero-downtime schema migration  

---

## 🏗️ Technical Summary

### Schema Change
```prisma
model ClauseDecision {
  // ... existing fields ...
  findingId  String?  // NEW: Optional - ties decision to specific finding
  finding    AnalysisFinding? @relation(...) // NEW
}
```

### API Enhancement
```typescript
// POST /api/clauses/[id]/decisions
{
  "actionType": "ACCEPT_DEVIATION",
  "findingId": "finding-123",  // NEW: Optional
  "payload": { ... }
}
```

### UI Changes
- Action buttons on each finding card
- Finding-level status badges
- Dropdown to select which fallback to apply
- Filterable decision history (show all / specific finding)

---

## 📈 Success Metrics

- **Target**: 80% of reviewers prefer finding-level actions (user survey)
- **Target**: 60% of decisions made at finding level within 2 weeks
- **Target**: Average time to handle multi-finding clause reduces by 30%

---

## 🚀 Next Steps

1. **Review spec.md** - Provide feedback on user stories and technical approach
2. **Create implementation plan** - Break down into phases
3. **Generate task breakdown** - Detailed developer tasks with time estimates
4. **Schedule for post-MVP** - After Feature 006 Phase 10 (Polish) is complete

---

## 💬 Feedback & Questions

Open questions to discuss:
- Should we allow "Accept All Findings" as a bulk action?
- How to handle finding deletion when it has active decisions?
- Should finding-level become the default mode with clause-level as fallback?

---

**Created**: 2026-02-17  
**Last Updated**: 2026-02-17  
**Contact**: Product/Engineering leads
