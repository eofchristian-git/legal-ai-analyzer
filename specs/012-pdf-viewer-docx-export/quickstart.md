# Quickstart: PDF Document Viewer & Original-File Export

**Feature**: 012-pdf-viewer-docx-export

---

## Prerequisites

1. **Node.js 20+** and **npm** installed
2. **LibreOffice** installed and available as `soffice` on PATH (needed for DOCX → PDF conversion)
   - Windows: Download from https://www.libreoffice.org/download/ — add to PATH
   - macOS: `brew install --cask libreoffice`
   - Linux/Docker: `apt-get install libreoffice-core libreoffice-writer`
3. Existing project dependencies installed (`npm install`)

## Setup

### 1. Install new dependencies

```bash
npm install pdf-lib jszip fast-xml-parser
```

### 2. Verify LibreOffice is available

```bash
soffice --version
# Should output something like: LibreOffice 24.x.x.x ...
```

### 3. Run database migration

After the schema changes are applied to `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name add-pdf-viewer-fields
npx prisma generate
```

### 4. Start development server

```bash
npm run dev
```

## Testing the Feature

### PDF Pipeline (after Phase 1)

1. Upload a DOCX contract and run analysis
2. Check the terminal logs for PDF conversion output:
   ```
   [PDF Pipeline] Converting DOCX to PDF...
   [PDF Pipeline] Extracting text positions (X pages)...
   [PDF Pipeline] Mapping N clauses and M findings...
   [PDF Pipeline] Pipeline completed.
   ```
3. Verify in DB: `ContractDocument.pdfConversionStatus` should be `completed`

### PDF Viewer (after Phase 2 + 4)

1. Open a contract that has completed analysis + PDF conversion
2. The document should render as a scrollable PDF with risk highlights visible
3. Click clauses in the left panel — document should scroll to the correct position
4. Apply a fallback on a finding — strikethrough + replacement text should appear instantly as an overlay

### Export (after Phase 3 + 4)

1. Complete triage on a contract (apply fallbacks, add notes)
2. Click "Export" → "Original with Changes (.docx)"
3. Open the downloaded file in Microsoft Word
4. Verify:
   - Original formatting preserved (headers, logos, tables, fonts)
   - Review tab shows tracked changes with "Legal AI Analyzer" as author
   - Each applied fallback appears as a deletion + insertion
   - Triage notes appear as margin comments

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/pdf-pipeline.ts` | DOCX → PDF conversion + text position extraction |
| `src/lib/pdf-position-mapper.ts` | Maps clause/finding excerpts to PDF coordinates |
| `src/lib/docx-modifier.ts` | Server-side DOCX XML manipulation for export |
| `src/app/(app)/contracts/[id]/_components/pdf-viewer/` | PDF viewer React components |
| `src/app/api/contracts/[id]/pdf-document/route.ts` | Serve PDF + position mappings |
| `src/app/api/contracts/[id]/export-modified/route.ts` | Export original DOCX with tracked changes |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `soffice: command not found` | Install LibreOffice and ensure `soffice` is on PATH |
| PDF conversion hangs | LibreOffice may have a lock file — delete `~/.config/libreoffice/.~lock.*` |
| "Position mapping failed" in logs | Check that AI analysis produced valid `excerpt` text in findings |
| Exported DOCX has no tracked changes | Verify findings have `APPLY_FALLBACK` decisions in `ClauseDecision` |
| Comments not appearing in Word | Check `[Content_Types].xml` has the comments relationship entry |
