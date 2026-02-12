-- CreateTable
CREATE TABLE "FindingComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingComment_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AnalysisFinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FindingComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnalysisFinding" (
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
    CONSTRAINT "AnalysisFinding_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "AnalysisClause" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalysisFinding_triagedBy_fkey" FOREIGN KEY ("triagedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AnalysisFinding" ("clauseId", "createdAt", "fallbackText", "id", "matchedRuleId", "matchedRuleTitle", "riskLevel", "summary", "triageDecision", "triageNote", "triagedAt", "triagedBy", "whyTriggered") SELECT "clauseId", "createdAt", "fallbackText", "id", "matchedRuleId", "matchedRuleTitle", "riskLevel", "summary", "triageDecision", "triageNote", "triagedAt", "triagedBy", "whyTriggered" FROM "AnalysisFinding";
DROP TABLE "AnalysisFinding";
ALTER TABLE "new_AnalysisFinding" RENAME TO "AnalysisFinding";
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" TEXT,
    "ourSide" TEXT NOT NULL,
    "counterparty" TEXT,
    "deadline" DATETIME,
    "focusAreas" TEXT,
    "dealContext" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("contractType", "counterparty", "createdAt", "deadline", "dealContext", "documentId", "focusAreas", "id", "ourSide", "status", "title", "updatedAt") SELECT "contractType", "counterparty", "createdAt", "deadline", "dealContext", "documentId", "focusAreas", "id", "ourSide", "status", "title", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
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
    "finalizedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAnalysis_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAnalysis_playbookSnapshotId_fkey" FOREIGN KEY ("playbookSnapshotId") REFERENCES "PlaybookSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContractAnalysis_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContractAnalysis_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContractAnalysis" ("clauseAnalyses", "contractId", "createdAt", "executiveSummary", "finalized", "finalizedAt", "greenCount", "id", "modelUsed", "negotiationStrategy", "overallRisk", "playbookSnapshotId", "playbookVersionId", "rawAnalysis", "redCount", "redlineSuggestions", "reviewBasis", "tokensUsed", "yellowCount") SELECT "clauseAnalyses", "contractId", "createdAt", "executiveSummary", "finalized", "finalizedAt", "greenCount", "id", "modelUsed", "negotiationStrategy", "overallRisk", "playbookSnapshotId", "playbookVersionId", "rawAnalysis", "redCount", "redlineSuggestions", "reviewBasis", "tokensUsed", "yellowCount" FROM "ContractAnalysis";
DROP TABLE "ContractAnalysis";
ALTER TABLE "new_ContractAnalysis" RENAME TO "ContractAnalysis";
CREATE UNIQUE INDEX "ContractAnalysis_contractId_key" ON "ContractAnalysis"("contractId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

