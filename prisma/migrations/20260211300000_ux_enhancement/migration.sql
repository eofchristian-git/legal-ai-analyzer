-- Add excerpt column to AnalysisFinding
ALTER TABLE "AnalysisFinding" ADD COLUMN "excerpt" TEXT NOT NULL DEFAULT '';

-- Create NegotiationItem table
CREATE TABLE "NegotiationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clauseRef" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationItem_analysisId_fkey"
      FOREIGN KEY ("analysisId") REFERENCES "ContractAnalysis"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for fast lookup by analysis
CREATE INDEX "NegotiationItem_analysisId_idx" ON "NegotiationItem"("analysisId");
