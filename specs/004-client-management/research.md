# Research: Client Management

**Feature**: `004-client-management` | **Date**: 2026-02-13

## Research Topics & Decisions

### 1. Document Copy Strategy for Reviews

**Decision**: When starting a contract review from a client's attached contract, create a new `Document` row by copying the file on disk to a new `uploads/` subdirectory and duplicating all metadata fields (`filename`, `fileType`, `extractedText`, `fileSize`, `pageCount`). The new `Document.id` is linked to the new `Contract` review.

**Rationale**: The existing upload flow (`POST /api/upload`) creates a `Document` by writing to `uploads/{tempId}/filename` and storing the path. Copying the file + creating a new `Document` row ensures:
- The client's original document is never modified (FR-013).
- Deleting a client's contract doesn't affect existing reviews (FR-015).
- Each review has its own independent document, consistent with the current contract creation flow.

**Alternatives Considered**:
- *Shared document reference (soft link)*: Both client contract and review point to the same `Document`. Rejected because deleting the client's contract would cascade-delete the shared document, breaking reviews.
- *Copy-on-write (lazy)*: Only copy if the original is modified. Rejected because it adds complexity for no benefit — originals are never modified.

---

### 2. Prisma Schema Extension Strategy

**Decision**: Add two new models (`Client`, `ClientContract`) and extend the existing `Contract` model with an optional `clientId` foreign key. This requires a single Prisma migration.

**Rationale**: 
- `Client` is a new first-class entity with its own lifecycle (soft-delete).
- `ClientContract` is a junction between `Client` and `Document`, representing the "master copy" attachment.
- Adding `clientId` to the existing `Contract` model (optional, nullable) enables traceability from reviews back to clients (FR-017) without breaking existing contract creation flows.

**Alternatives Considered**:
- *Separate `ClientContractReview` model*: Rejected — adds unnecessary indirection. The existing `Contract` model already represents reviews; adding an optional `clientId` is simpler.
- *JSON field for client reference*: Rejected — not queryable, not type-safe, violates Prisma conventions.

---

### 3. File Upload Reuse for Client Contracts

**Decision**: Reuse the existing `POST /api/upload` endpoint for uploading client contract documents. The client contract attachment flow will be: (1) upload document via `/api/upload`, (2) create `ClientContract` linking the `Document` to the `Client` via `POST /api/clients/[id]/contracts`.

**Rationale**: The existing upload endpoint handles file parsing, text extraction, and storage. No modifications needed. This two-step approach matches the pattern used by contract upload (`/contracts/upload/page.tsx`).

**Alternatives Considered**:
- *Dedicated upload endpoint for client contracts*: Rejected — duplicates existing upload logic for no benefit.
- *Combined upload + attach in single endpoint*: Rejected — breaks separation of concerns and the existing pattern.

---

### 4. Sidebar Navigation Integration

**Decision**: Add `{ href: "/clients", label: "Clients", icon: Building2 }` to the `navItems` array in `sidebar.tsx`, positioned at index 2 (after "Contract Review", before "NDA Triage"). Use the `Building2` icon from lucide-react.

**Rationale**: `Building2` is the standard lucide icon for organization/company entities. Positioned after "Contract Review" per clarification session. The existing sidebar renders all `navItems` in array order, so insertion at index 2 is sufficient.

**Alternatives Considered**:
- *`Users` icon*: Already used for "User Management" in admin section; would cause visual confusion.
- *`Briefcase` icon*: Viable but `Building2` more clearly represents a company/client entity.

---

### 5. Country Field Storage Format

**Decision**: Store the ISO 3166-1 alpha-2 country code (e.g., "US", "DE") in the `Client.country` field. Display the full name + flag using the existing `COUNTRIES` list from `src/lib/countries.ts` and the `CountryFlag` component from `src/components/shared/country-flag.tsx`.

**Rationale**: Matches the pattern used by `PlaybookRule.country`. The `COUNTRIES` constant already has 30 countries with code, name, and flag emoji. The `getCountryByCode()` helper enables lookup for display.

**Alternatives Considered**:
- *Store full country name*: Rejected — harder to normalize, match, and filter.
- *Store both code and name*: Rejected — denormalization adds maintenance burden.

---

### 6. Industry Field Implementation

**Decision**: Create a new `src/lib/industries.ts` file exporting a `INDUSTRIES` constant array: `["Technology", "Finance", "Healthcare", "Manufacturing", "Energy", "Legal", "Retail", "Other"]`. Store the string value directly in `Client.industry`. Render as a `Select` dropdown.

**Rationale**: Simple, no database table needed. The list is small and unlikely to change frequently. If expansion is needed later, it's a single-file edit. Matches the pattern of `COUNTRIES` being a static constant.

**Alternatives Considered**:
- *Database-backed industry table*: Rejected — overengineering for 8 static values.
- *Enum in Prisma*: SQLite doesn't support enums natively; Prisma would use a CHECK constraint, which is fine but a static list is simpler to maintain.

---

### 7. Soft Delete Implementation

**Decision**: Add `deleted Boolean @default(false)` and `deletedAt DateTime?` fields to the `Client` model. All list queries filter with `where: { deleted: false }`. The detail endpoint returns the client regardless (for admin restore). A `POST /api/clients/[id]/restore` endpoint sets `deleted: false, deletedAt: null`.

**Rationale**: Matches the constitution's Data Integrity principle ("Soft-delete MUST be preferred over hard-delete for audit trail purposes"). The pattern is simple and doesn't require a separate archive table.

**Alternatives Considered**:
- *`status` field with enum (active/archived/deleted)*: Viable but more complex than needed. Two boolean-like states (active vs. deleted) are sufficient for now.
- *Separate archive table*: Rejected — adds complexity with no benefit for the expected scale.

---

### 8. Client List Page Design

**Decision**: Use a Table layout (matching the Contracts list page pattern) with columns: Name, Country (flag + name), Industry, Contracts (count), Created, Actions. Include a search input for name filtering and a country dropdown filter above the table.

**Rationale**: Maintains visual consistency with the existing Contracts list page. Table layout is efficient for scanning many records. Client-side filtering is sufficient for the expected scale (100+ clients).

**Alternatives Considered**:
- *Card/grid layout*: Rejected — less information-dense, inconsistent with other list pages.
- *Server-side filtering*: Not needed at current scale; can be added later if client list exceeds 1000+.
