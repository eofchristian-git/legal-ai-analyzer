# Data Model: Interactive Document Viewer & Redline Export

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Status**: Design Phase

## Overview

This feature introduces the `ContractDocument` entity to store HTML-converted contract documents and position mappings for clauses and findings. It extends the existing data model without modifying core entities, ensuring backward compatibility.

## Entity Relationship Diagram

```
Contract (existing)
├── id
├── title
├── ...
└── 1:1 → ContractDocument (NEW)
            ├── id
            ├── contractId (FK)
            ├── originalPdfPath
            ├── htmlContent
            ├── pageCount
            ├── clausePositions (JSON)
            ├── findingPositions (JSON)
            ├── conversionStatus
            ├── createdAt
            └── updatedAt

ContractAnalysis (existing)
└── clauses[]
    ├── AnalysisClause (existing)
    │   └── id (referenced in clausePositions)
    └── findings[]
        └── AnalysisFinding (existing)
            └── id (referenced in findingPositions)

ClauseDecision (existing - Feature 006)
└── Used by projection system for tracked changes
```

## New Entities

### ContractDocument

Stores the HTML-converted document and position mappings for rendering.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String | Primary Key, CUID | Unique identifier |
| `contractId` | String | Foreign Key, Unique, Not Null | Reference to Contract (1:1) |
| `originalPdfPath` | String | Not Null | Path to original uploaded file (Word/PDF) |
| `htmlContent` | String | Nullable | Converted HTML content; null if conversion pending/failed |
| `pageCount` | Int | Not Null | Number of pages in document |
| `clausePositions` | String (JSON) | Not Null, Default '[]' | Array of clause position objects |
| `findingPositions` | String (JSON) | Not Null, Default '[]' | Array of finding position objects |
| `conversionStatus` | String | Not Null, Default 'pending' | Status: 'pending', 'processing', 'completed', 'failed' |
| `conversionError` | String | Nullable | Error message if conversion failed |
| `createdAt` | DateTime | Not Null, Default now() | Creation timestamp |
| `updatedAt` | DateTime | Not Null, Auto-update | Last update timestamp |

**Relationships**:
- Belongs to `Contract` (1:1) via `contractId`
- Indirectly references `AnalysisClause` and `AnalysisFinding` via position JSON

**Indexes**:
- `contractId` (unique)
- `conversionStatus` (for querying pending/failed conversions)
- `createdAt` (for retention policy cleanup queries)

**JSON Structures**:

```typescript
// clausePositions JSON array
interface ClausePosition {
  clauseId: string;        // AnalysisClause.id
  page: number;            // 1-indexed page number
  x: number;               // Horizontal position (px)
  y: number;               // Vertical position (px)
  width: number;           // Bounding box width (px)
  height: number;          // Bounding box height (px)
}

// findingPositions JSON array
interface FindingPosition {
  findingId: string;       // AnalysisFinding.id
  clauseId: string;        // Parent clause ID
  page: number;            // 1-indexed page number
  x: number;               // Horizontal position (px)
  y: number;               // Vertical position (px)
  width: number;           // Bounding box width (px)
  height: number;          // Bounding box height (px)
}
```

## Modified Entities

### Contract (No Schema Changes)

**Relationship Added**:
- Has one `ContractDocument` (optional) via `ContractDocument.contractId`

**Query Pattern**:
```typescript
const contract = await db.contract.findUnique({
  where: { id },
  include: {
    document: true,  // ContractDocument
    analysis: {
      include: {
        clauses: {
          include: { findings: true }
        }
      }
    }
  }
});
```

### ContractAnalysis (No Schema Changes)

No modifications required. Position data references clause/finding IDs from existing schema.

### AnalysisClause (No Schema Changes)

No modifications required. Clause IDs are referenced in `ContractDocument.clausePositions`.

### AnalysisFinding (No Schema Changes)

No modifications required. Finding IDs are referenced in `ContractDocument.findingPositions`.

## Prisma Schema Changes

### New Model

```prisma
model ContractDocument {
  id                String   @id @default(cuid())
  contractId        String   @unique
  contract          Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  
  // Original document
  originalPdfPath   String
  
  // Converted content
  htmlContent       String?  // Nullable until conversion completes
  pageCount         Int
  
  // Position mappings (stored as JSON)
  clausePositions   String   @default("[]")  // JSON array of ClausePosition
  findingPositions  String   @default("[]")  // JSON array of FindingPosition
  
  // Conversion status
  conversionStatus  String   @default("pending")  // 'pending' | 'processing' | 'completed' | 'failed'
  conversionError   String?
  
  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([contractId])
  @@index([conversionStatus])
  @@index([createdAt])
}
```

### Contract Model Update

```prisma
model Contract {
  id       String   @id @default(cuid())
  // ... existing fields ...
  
  // NEW: Relationship to document
  document ContractDocument?
  
  // ... existing relationships ...
}
```

## Migration Strategy

### Migration Script

```prisma
-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "originalPdfPath" TEXT NOT NULL,
    "htmlContent" TEXT,
    "pageCount" INTEGER NOT NULL,
    "clausePositions" TEXT NOT NULL DEFAULT '[]',
    "findingPositions" TEXT NOT NULL DEFAULT '[]',
    "conversionStatus" TEXT NOT NULL DEFAULT 'pending',
    "conversionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_contractId_key" ON "ContractDocument"("contractId");

-- CreateIndex
CREATE INDEX "ContractDocument_conversionStatus_idx" ON "ContractDocument"("conversionStatus");

-- CreateIndex
CREATE INDEX "ContractDocument_createdAt_idx" ON "ContractDocument"("createdAt");
```

### Data Migration

No existing data migration needed. ContractDocument will be created for new contracts going forward. Existing contracts without a ContractDocument will:
- Display in legacy clause-by-clause mode
- Have ContractDocument created if user triggers re-analysis

## State Transitions

### Conversion Status Lifecycle

```
pending → processing → completed
                    ↓
                  failed
```

**State Definitions**:
- `pending`: Document uploaded, conversion not started
- `processing`: Conversion in progress (Word/PDF → HTML)
- `completed`: Conversion successful, HTML and positions stored
- `failed`: Conversion failed, error stored in `conversionError`

**Transition Rules**:
- `pending` → `processing`: When analysis starts
- `processing` → `completed`: When conversion succeeds and positions calculated
- `processing` → `failed`: When conversion fails (with error message)
- `failed` → `processing`: When user retries analysis

## Validation Rules

### Field Validations

**contractId**:
- Must reference existing Contract
- Must be unique (1:1 relationship)

**originalPdfPath**:
- Must be non-empty string
- Should point to accessible file in storage

**htmlContent**:
- Can be null initially
- Must be set when conversionStatus = 'completed'
- Should be sanitized HTML (no dangerous scripts)

**pageCount**:
- Must be positive integer
- Typically 1-200 for contracts

**clausePositions / findingPositions**:
- Must be valid JSON array
- Each position object must have required fields
- Clause/finding IDs must reference existing entities

**conversionStatus**:
- Must be one of: 'pending', 'processing', 'completed', 'failed'

### Business Rules

1. **Conversion Requirement**: Contract analysis cannot complete if conversionStatus = 'failed'
2. **Position Integrity**: Position arrays must align with existing clauses/findings
3. **Retention Policy**:
   - Finalized contracts: Retain indefinitely
   - Draft contracts: Delete after 90 days
   - Cancelled contracts: Delete after 90 days

## Retention Policy Implementation

### Cleanup Logic

```typescript
// Run daily as scheduled job
async function cleanupOldDocuments() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  // Find contracts eligible for cleanup
  const eligibleContracts = await db.contract.findMany({
    where: {
      status: { in: ['draft', 'cancelled'] },
      createdAt: { lt: ninetyDaysAgo },
      document: { isNot: null }
    },
    include: { document: true }
  });
  
  // Delete ContractDocument records
  for (const contract of eligibleContracts) {
    await db.contractDocument.delete({
      where: { contractId: contract.id }
    });
    // Original file (originalPdfPath) is retained
  }
  
  console.log(`Cleaned up ${eligibleContracts.length} document records`);
}
```

### Retention Metadata

Consider adding optional fields for tracking:
```prisma
retentionExempt   Boolean  @default(false)  // Manual override for retention
lastAccessedAt    DateTime?                 // Track usage for analytics
```

## Query Patterns

### Fetch Document for Viewing

```typescript
const contractWithDocument = await db.contract.findUnique({
  where: { id: contractId },
  include: {
    document: true,
    analysis: {
      include: {
        clauses: {
          include: {
            findings: true,
            decisions: {
              orderBy: { timestamp: 'asc' }
            }
          }
        }
      }
    }
  }
});

if (!contractWithDocument?.document) {
  throw new Error('Document not converted yet');
}

if (contractWithDocument.document.conversionStatus !== 'completed') {
  throw new Error('Document conversion pending or failed');
}

// Parse position mappings
const clausePositions = JSON.parse(contractWithDocument.document.clausePositions);
const findingPositions = JSON.parse(contractWithDocument.document.findingPositions);
```

### Check Conversion Status

```typescript
const document = await db.contractDocument.findUnique({
  where: { contractId },
  select: { conversionStatus: true, conversionError: true }
});

if (document?.conversionStatus === 'failed') {
  console.error('Conversion failed:', document.conversionError);
}
```

### Find Documents Needing Conversion

```typescript
const pendingDocuments = await db.contractDocument.findMany({
  where: { conversionStatus: 'pending' },
  include: { contract: true },
  orderBy: { createdAt: 'asc' },
  take: 10
});
```

## Performance Considerations

### Index Usage

- `contractId` unique index: Fast lookup for document by contract
- `conversionStatus` index: Efficient queries for pending/failed conversions
- `createdAt` index: Optimizes retention policy cleanup queries

### Storage Optimization

- **HTML Compression**: Consider compressing `htmlContent` (gzip) if size is concern
- **Position JSON**: Keep position arrays compact; avoid redundant data
- **Pagination**: Load document pages incrementally if needed

### Caching Strategy

- Cache parsed position mappings in memory (avoid repeated JSON.parse)
- Cache HTML content in Redis for frequently accessed documents
- Invalidate cache on document update

## Security Considerations

### Access Control

- Verify user has permission to view Contract before serving ContractDocument
- Apply same RBAC rules as contract detail page
- Audit log document access for compliance

### Data Sanitization

- Sanitize `htmlContent` before storage (use DOMPurify)
- Validate position coordinates are within reasonable bounds
- Prevent XSS through user-uploaded content

### File Storage

- Store `originalPdfPath` securely (not web-accessible)
- Use signed URLs for temporary file access if needed
- Implement virus scanning on upload

## Testing Checklist

### Unit Tests

- [ ] Validate position JSON parsing/serialization
- [ ] Test retention policy date calculations
- [ ] Verify conversionStatus transitions

### Integration Tests

- [ ] Create ContractDocument during analysis
- [ ] Update positions after HTML conversion
- [ ] Query document with positions
- [ ] Delete document via retention policy

### Data Integrity Tests

- [ ] Cascade delete when Contract is deleted
- [ ] Position IDs reference valid clauses/findings
- [ ] HTML content is sanitized

## Future Enhancements

- **Version History**: Track changes to htmlContent over time
- **Partial Conversion**: Support incremental position updates
- **Position Confidence**: Store accuracy scores for position mappings
- **Analytics**: Track which parts of documents are viewed most

## References

- [Prisma Schema Documentation](https://www.prisma.io/docs/concepts/components/prisma-schema)
- [JSON Field Best Practices](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields)
- Feature 005: Deviation-Focused Analysis (locationPage/locationPosition metadata)
- Feature 006: Clause Decision Actions (ClauseDecision event log)
