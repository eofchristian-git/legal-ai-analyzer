-- CreateTable
CREATE TABLE "AnalysisClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "clauseName" TEXT NOT NULL,
    "clauseText" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisClause_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContractAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clauseId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "matchedRuleTitle" TEXT NOT NULL,
    "matchedRuleId" TEXT,
    "summary" TEXT NOT NULL,
    "fallbackText" TEXT NOT NULL,
    "whyTriggered" TEXT NOT NULL,
    "triageDecision" TEXT,
    "triageNote" TEXT,
    "triagedBy" TEXT,
    "triagedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisFinding_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "AnalysisClause" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContractAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "overallRisk" TEXT NOT NULL,
    "greenCount" INTEGER NOT NULL DEFAULT 0,
    "yellowCount" INTEGER NOT NULL DEFAULT 0,
    "redCount" INTEGER NOT NULL DEFAULT 0,
    "rawAnalysis" TEXT NOT NULL,
    "clauseAnalyses" TEXT NOT NULL,
    "redlineSuggestions" TEXT NOT NULL,
    "negotiationStrategy" TEXT,
    "executiveSummary" TEXT,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "reviewBasis" TEXT NOT NULL,
    "playbookVersionId" TEXT,
    "playbookSnapshotId" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAnalysis_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAnalysis_playbookSnapshotId_fkey" FOREIGN KEY ("playbookSnapshotId") REFERENCES "PlaybookSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContractAnalysis" ("clauseAnalyses", "contractId", "createdAt", "executiveSummary", "greenCount", "id", "modelUsed", "negotiationStrategy", "overallRisk", "playbookVersionId", "rawAnalysis", "redCount", "redlineSuggestions", "reviewBasis", "tokensUsed", "yellowCount") SELECT "clauseAnalyses", "contractId", "createdAt", "executiveSummary", "greenCount", "id", "modelUsed", "negotiationStrategy", "overallRisk", "playbookVersionId", "rawAnalysis", "redCount", "redlineSuggestions", "reviewBasis", "tokensUsed", "yellowCount" FROM "ContractAnalysis";
DROP TABLE "ContractAnalysis";
ALTER TABLE "new_ContractAnalysis" RENAME TO "ContractAnalysis";
CREATE UNIQUE INDEX "ContractAnalysis_contractId_key" ON "ContractAnalysis"("contractId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisClause_analysisId_position_key" ON "AnalysisClause"("analysisId", "position");
