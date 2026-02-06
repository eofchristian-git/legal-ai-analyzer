-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contract" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractAnalysis" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAnalysis_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NdaTriage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "classification" TEXT,
    "ndaType" TEXT,
    "term" TEXT,
    "governingLaw" TEXT,
    "rawAnalysis" TEXT,
    "screeningResults" TEXT,
    "issuesFound" TEXT,
    "recommendation" TEXT,
    "modelUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NdaTriage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "regulations" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rawAnalysis" TEXT,
    "findings" TEXT,
    "overallStatus" TEXT,
    "modelUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplianceCheck_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "severity" INTEGER,
    "likelihood" INTEGER,
    "riskScore" INTEGER,
    "riskLevel" TEXT,
    "rawAnalysis" TEXT,
    "riskMemo" TEXT,
    "mitigationOptions" TEXT,
    "modelUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskAssessment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractAnalysis_contractId_key" ON "ContractAnalysis"("contractId");
