# Feature Specification: Client Management

**Feature Branch**: `004-client-management`  
**Created**: 2026-02-13  
**Status**: Draft  
**Input**: User description: "I want to add additional tab on the left side bar named 'Clients' there we should be able to create new client and attach the client's contract. Client as an entity should have A name, a country, probably some additional properties. We need to be able to filter clients. Please consider that in the future I'm going to use this client entity for the contract review. Clients document should remain the same, for the contract review we should create a copy of the existing client's contract."

## Clarifications

### Session 2026-02-13

- Q: Where should the "Clients" navigation item appear in the sidebar relative to existing items? → A: After Contract Review (3rd item)
- Q: How should the client detail page be accessed — dedicated route or inline panel? → A: Dedicated page (`/clients/[id]`)
- Q: Can a user start multiple independent reviews from the same client contract? → A: Yes, unlimited — each creates a new independent document copy and review
- Q: Should the "industry" field be free text or a predefined list? → A: Predefined dropdown (Technology, Finance, Healthcare, Manufacturing, Energy, Legal, Retail, Other)
- Q: Should client deletion be hard delete or soft delete? → A: Soft delete — client marked as deleted/archived, hidden from lists, recoverable

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a New Client (Priority: P1)

A legal team member navigates to the "Clients" section from the sidebar and creates a new client record. They provide the client's name, country, industry, and optional contact and notes. The client is saved and appears in the client list.

**Why this priority**: The ability to create and store clients is the foundation of the entire feature. Without client records, no contracts can be attached and no filtering can occur.

**Independent Test**: Can be fully tested by navigating to the Clients page, clicking "New Client", filling out the form, and verifying the client appears in the list.

**Acceptance Scenarios**:

1. **Given** the user is on the Clients page, **When** they click "New Client" and fill in the required fields (name, country) and submit, **Then** the client is created and appears in the clients list.
2. **Given** the user is creating a new client, **When** they leave the name field empty and attempt to save, **Then** a validation message appears and the client is not saved.
3. **Given** the user is creating a new client, **When** they fill in all fields including optional ones (industry, contact person, email, phone, notes) and submit, **Then** all data is saved and viewable on the client's detail page.

---

### User Story 2 - Attach Contract Documents to a Client (Priority: P1)

A legal team member opens an existing client's detail page and uploads one or more contract documents. These documents are stored as the client's reference contracts (originals). The uploaded documents are listed on the client's profile.

**Why this priority**: Attaching contracts to a client is the primary use case described by the user. This enables the future workflow where contracts are copied for review.

**Independent Test**: Can be fully tested by creating a client, navigating to the client's page, uploading a contract document, and verifying it appears in the client's contract list.

**Acceptance Scenarios**:

1. **Given** the user is on a client's detail page, **When** they upload a contract document (PDF or DOCX), **Then** the document is attached to the client and appears in the client's contracts list.
2. **Given** a client has attached contracts, **When** the user views the client detail page, **Then** they see a list of all attached contracts with filename, upload date, and file type.
3. **Given** a client has attached contracts, **When** the user deletes a contract, **Then** the contract is removed from the client's list but the original document file is handled according to system policy.
4. **Given** the user uploads a contract to a client, **When** they later initiate a contract review, **Then** a copy of the client's contract document is created for the review — the original client document remains unchanged.

---

### User Story 3 - Browse and Filter Clients (Priority: P2)

A legal team member navigates to the Clients page and sees a list of all clients. They can search by name and filter by country to quickly find the client they need.

**Why this priority**: Filtering and searching becomes important as the number of clients grows. It enables efficient navigation and is a prerequisite for productive day-to-day use.

**Independent Test**: Can be fully tested by creating multiple clients with different countries and names, then using search and filters to verify correct results appear.

**Acceptance Scenarios**:

1. **Given** the user is on the Clients page with multiple clients, **When** they type a name in the search box, **Then** only clients whose name contains the search text are displayed.
2. **Given** the user is on the Clients page, **When** they select a country filter, **Then** only clients from that country are displayed.
3. **Given** the user has applied a search and country filter, **When** they clear all filters, **Then** the full client list is shown again.
4. **Given** there are no clients matching the current filters, **When** the user views the page, **Then** a friendly "No clients match your filters" empty state is displayed.

---

### User Story 4 - View and Edit Client Details (Priority: P2)

A legal team member opens a client's detail page to view all information. They can edit the client's name, country, industry, contact details, and notes. Changes are saved and reflected immediately.

**Why this priority**: The ability to maintain accurate client records is essential for ongoing case management.

**Independent Test**: Can be fully tested by opening a client, editing fields, saving, and confirming the updated data persists on reload.

**Acceptance Scenarios**:

1. **Given** the user is on a client's detail page, **When** they click "Edit" and change the client's name, **Then** the updated name is saved and displayed.
2. **Given** the user is editing a client, **When** they clear a required field (name) and try to save, **Then** a validation error is shown and changes are not saved.

---

### User Story 5 - Start Contract Review from Client's Contract (Priority: P3)

A legal team member views a client's attached contracts and initiates a contract review directly from one of them. The system creates a copy of the selected document and begins the standard contract review workflow. The client's original contract document remains unmodified.

**Why this priority**: This connects the client management feature to the existing contract review workflow. It is marked P3 because the core contract review already works — this adds a convenient entry point from the client context.

**Independent Test**: Can be fully tested by attaching a contract to a client, initiating a review from it, and verifying the review has its own document copy while the client's original remains unchanged.

**Acceptance Scenarios**:

1. **Given** a client has an attached contract, **When** the user clicks "Start Review" on that contract, **Then** the system creates a copy of the document, creates a new contract review linked to it, and navigates the user to the contract review page.
2. **Given** a review was started from a client's contract, **When** the user views the client's original contract, **Then** the original document is unchanged and unaffected by the review process.
3. **Given** a review was started from a client's contract, **When** the user views the contract review, **Then** the review indicates which client it was created from.

---

### User Story 6 - Delete a Client (Priority: P3)

A legal team member deletes a client that is no longer needed. A confirmation dialog warns about the action. Deleting a client soft-deletes it — the client record is marked as archived and hidden from active lists, but can be recovered. Any existing contract reviews that were created from this client's contracts remain intact (since reviews use document copies).

**Why this priority**: Delete functionality is important for data hygiene but is used less frequently. Reviews remain unaffected due to the copy-on-review design.

**Independent Test**: Can be fully tested by creating a client, attaching contracts, starting a review, then deleting the client and confirming the review still works.

**Acceptance Scenarios**:

1. **Given** the user is on a client's page, **When** they click "Delete" and confirm, **Then** the client is soft-deleted (archived) and no longer appears in the active client list.
2. **Given** a client has been deleted, **When** the user views a contract review that was previously created from this client's contract, **Then** the review and its document copy still exist and function normally.
3. **Given** a client has been soft-deleted, **When** an admin or user with appropriate access restores it, **Then** the client reappears in the active client list with all data intact.

---

### Edge Cases

- What happens when a user tries to create a client with a name that already exists? The system allows it (different clients can have the same name — e.g., branches in different countries).
- What happens when a user uploads an unsupported file type as a client contract? The system shows a validation error and rejects the upload, only allowing PDF and DOCX files.
- What happens when a user tries to delete a client while another user is viewing it? The viewing user sees a "Client not found" state on next action.
- What happens when a contract review is in progress and the source client's contract is deleted directly? The review continues unaffected because it uses a copied document.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Clients" navigation item in the sidebar, positioned immediately after "Contract Review" (3rd item).
- **FR-002**: System MUST allow users to create a new client with at minimum a name and country.
- **FR-003**: System MUST allow users to optionally provide industry (predefined dropdown: Technology, Finance, Healthcare, Manufacturing, Energy, Legal, Retail, Other), contact person name, contact email, contact phone, and notes when creating or editing a client.
- **FR-004**: System MUST display a list of all clients on the Clients page, showing name, country, number of attached contracts, and creation date.
- **FR-005**: System MUST allow users to search clients by name (text search).
- **FR-006**: System MUST allow users to filter clients by country.
- **FR-007**: System MUST allow users to open a client detail page at `/clients/[id]` (dedicated route) to view all client information and attached contracts.
- **FR-008**: System MUST allow users to edit all client fields (name, country, industry, contact details, notes).
- **FR-009**: System MUST allow users to upload contract documents (PDF, DOCX) to a client's profile.
- **FR-010**: System MUST display attached contracts on the client detail page with filename, file type, upload date, and file size.
- **FR-011**: System MUST allow users to delete an attached contract from a client.
- **FR-012**: System MUST allow users to initiate a contract review from a client's attached contract by creating a copy of the document for the review workflow. Multiple independent reviews from the same client contract are allowed (no limit).
- **FR-013**: The original client contract document MUST remain unmodified when a review is initiated from it.
- **FR-014**: System MUST allow users to delete a client (with confirmation dialog). Deletion is a soft delete — the client record is marked as archived and hidden from active lists, but remains recoverable.
- **FR-015**: Deleting a client MUST NOT affect any contract reviews that were previously created from the client's contracts.
- **FR-016**: System MUST track which user created each client.
- **FR-017**: The contract review entity SHOULD store a reference to the source client, enabling traceability from reviews back to clients.

### Key Entities

- **Client**: Represents an external party the organization does business with. Key attributes: name, country (ISO code from predefined list), industry (predefined dropdown: Technology, Finance, Healthcare, Manufacturing, Energy, Legal, Retail, Other), contact person, contact email, contact phone, notes, deleted (boolean, default false), deletedAt (nullable timestamp). A client can have multiple attached contract documents. Created by a user. Supports soft delete — archived clients are hidden from active lists but retained in the database.
- **Client Contract (attachment)**: A contract document (PDF/DOCX) attached to a client's profile. This is the "master" or "reference" copy. Key attributes: document reference, client reference, upload date, uploaded by user. Uses the existing Document entity for file storage and text extraction.
- **Contract Review (existing, extended)**: The existing contract review entity gains an optional reference to the source client, so reviews created from a client's contract maintain traceability. When a review is initiated from a client contract, a new Document is created as a copy of the original.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new client in under 1 minute.
- **SC-002**: Users can find any client within 10 seconds using search or country filter, even with 100+ clients.
- **SC-003**: Users can attach a contract document to a client in under 30 seconds.
- **SC-004**: Users can initiate a contract review from a client's contract in 2 clicks or fewer (select contract → start review).
- **SC-005**: 100% of contract reviews created from client contracts have their own independent document copy — the client's original is never modified.
- **SC-006**: Deleting a client does not impact any previously created contract reviews.
- **SC-007**: The Clients page loads and displays the client list within 2 seconds.

## Assumptions

- The existing Document model (used for file storage, text extraction, and page count) will be reused for client contract uploads. No new file storage mechanism is needed.
- The existing file upload flow (PDF/DOCX parsing and text extraction) already in the system will be reused for client contract uploads.
- Authentication and authorization follow the same patterns as the rest of the application — all logged-in users can manage clients.
- Country selection will use the same country list already available in the system (used in the Playbook feature).
- The client entity is organization-wide — all users in the system can see all clients (no per-user client visibility restrictions).
