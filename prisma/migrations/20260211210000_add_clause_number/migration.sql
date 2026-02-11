-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnalysisClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "clauseNumber" TEXT NOT NULL DEFAULT '',
    "clauseName" TEXT NOT NULL,
    "clauseText" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisClause_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContractAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AnalysisClause" ("analysisId", "clauseName", "clauseText", "createdAt", "id", "position") SELECT "analysisId", "clauseName", "clauseText", "createdAt", "id", "position" FROM "AnalysisClause";
DROP TABLE "AnalysisClause";
ALTER TABLE "new_AnalysisClause" RENAME TO "AnalysisClause";
CREATE UNIQUE INDEX "AnalysisClause_analysisId_position_key" ON "AnalysisClause"("analysisId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

