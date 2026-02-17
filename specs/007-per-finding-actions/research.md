# Research: Per-Finding Decision Actions

**Feature**: 007-per-finding-actions
**Date**: 2026-02-17

## Research Tasks

### 1. Finding-Level Only (No Clause-Level Decisions)

**Decision**: All decisions operate at the finding level. There are no clause-level decisions. Clause status is derived by aggregating finding statuses.

**Rationale**: Clause-level decisions are fundamentally mismatched with the review workflow. A clause may contain findings with different risk levels requiring different actions. Forcing a single decision on the entire clause leads to workarounds. Making finding-level the only option simplifies the mental model — reviewers resolve findings, the system tracks clause progress.

**Alternatives considered**:
- Dual-mode (clause-level + finding-level coexisting) — rejected: confusing priority rules, complex projection logic, two UI paths
- Clause-level only (status quo) — rejected: doesn't solve the core problem

### 2. Derived Clause Status

**Decision**: Clause status is computed by `deriveClauseStatus()` which aggregates finding statuses:
- **RESOLVED**: All findings have resolved status (ACCEPTED, RESOLVED_APPLIED_FALLBACK, RESOLVED_MANUAL_EDIT)
- **PARTIALLY_RESOLVED**: Some but not all findings resolved
- **ESCALATED**: Any finding is in ESCALATED state (takes visual priority)
- **PENDING**: No findings resolved
- **NO_ISSUES**: Clause has zero findings

**Rationale**: Derived status eliminates the need for explicit clause-level decisions. The clause list naturally shows review progress. When the last finding is resolved, the clause auto-resolves — no extra click needed.

**Alternatives considered**:
- Explicit clause-level "finalize" step after all findings resolved — rejected: unnecessary friction
- Majority-based resolution (clause resolves when >50% findings resolved) — rejected: all findings matter for compliance

### 3. Text Modification Conflict Resolution

**Decision**: Last-write-wins across all finding-level text-modifying decisions (APPLY_FALLBACK, EDIT_MANUAL).

**Rationale**: A clause has one text body. Multiple findings may suggest different text replacements, but only one can be active. Last-write-wins is the simplest correct strategy. The spec explicitly prohibits NLP-based text merging (FR-009).

**Alternatives considered**:
- Merge/combine multiple fallback texts — rejected per FR-009: NLP complexity, unpredictable results
- Finding-scoped text regions — rejected: would require clause text segmentation which isn't available

### 4. Escalation Lock Granularity

**Decision**: Only the escalated finding is locked for non-approver users. Other findings remain fully actionable.

**Rationale**: This is the core value — surgical control. Locking the entire clause when one finding is escalated would block productive work on unrelated findings.

**Alternatives considered**:
- Entire clause locked on any escalation — rejected: blocks work on unrelated findings
- Text modifications blocked but notes/accepts allowed — rejected: unnecessary complexity

### 5. Legacy Decision Handling

**Decision**: Existing clause-level decisions (Feature 006, findingId=null) are preserved in the database but ignored by the projection engine. They appear in the decision history with a "Legacy" label.

**Rationale**: Preserves audit trail integrity (Constitution Principle I). No data migration or deletion needed. Legacy records don't interfere with the new finding-level projection since the engine filters them out.

**Alternatives considered**:
- Migrate legacy decisions to finding-level (assign to first/highest-risk finding) — rejected: would fabricate audit trail data
- Delete legacy decisions — rejected: violates data integrity principle

### 6. Deployment Strategy

**Decision**: No feature flag. Deploy in phases: schema migration → API enhancement → UI rollout.

**Rationale**: The project has no feature flag infrastructure. The API change is a breaking change for the POST endpoint (findingId now required), but since this is an internal app with no external consumers, the phased deployment is sufficient.

### 7. UI Component Architecture

**Decision**: Replace `decision-buttons.tsx` (clause-level) with `finding-actions.tsx` (per-finding). Add resolution progress to `clause-list.tsx`. Add "Accept All" / "Reset All" shortcuts above the findings list.

**Rationale**: Clean break from clause-level UI. Per-finding actions live on each finding card. Clause-wide shortcuts (Accept All, Reset All) provide bulk operations without reverting to clause-level decisions — they just loop over findings.

**Alternatives considered**:
- Keep decision-buttons.tsx and add finding actions alongside — rejected: confusing two-tier UI
- Inline all actions in findings-panel.tsx — rejected: component too large
