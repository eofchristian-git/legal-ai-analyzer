import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Maps SQL category_group values to PlaybookGroup slugs
const GROUP_SLUG_MAP: Record<string, string> = {
  CORE_LEGAL: "core-legal",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  LIFECYCLE: "contract-lifecycle",
  COMPLIANCE: "compliance",
  LEGAL_FRAMEWORK: "legal-framework",
  BOILERPLATE: "boilerplate",
};

// Risk weight mapping (SQL → PlaybookRule riskLevel)
// HIGH stays HIGH, MEDIUM stays MEDIUM, LOW stays LOW
// Mandatory clauses that are HIGH get bumped to CRITICAL
function mapRiskLevel(weight: string, isMandatory: boolean): string {
  if (isMandatory && weight === "HIGH") return "CRITICAL";
  return weight; // HIGH, MEDIUM, LOW all valid
}

interface ClauseCategory {
  code: string;
  name: string;
  description: string;
  riskWeight: string;
  categoryGroup: string;
  isMandatory: boolean;
}

// All 44 clause categories from the SQL script
const CLAUSE_CATEGORIES: ClauseCategory[] = [
  // Core Legal Clauses
  { code: "LIA-001", name: "Limitation of Liability", description: "Caps or limits on liability exposure", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: true },
  { code: "LIA-002", name: "Indemnification", description: "Indemnity and hold harmless provisions", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: true },
  { code: "IP-001", name: "Intellectual Property", description: "IP ownership, assignment, and licensing", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: true },
  { code: "DPA-001", name: "Data Protection/GDPR", description: "Data processing and privacy compliance", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: true },
  { code: "NCP-001", name: "Non-Competition", description: "Non-compete restrictions and exclusivity", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: false },
  { code: "PEN-001", name: "Financial Penalties", description: "Contractual penalties and liquidated damages", riskWeight: "HIGH", categoryGroup: "CORE_LEGAL", isMandatory: false },

  // Commercial Clauses
  { code: "PAY-001", name: "Payment Terms", description: "Payment timing, methods, and conditions", riskWeight: "MEDIUM", categoryGroup: "COMMERCIAL", isMandatory: true },
  { code: "PRI-001", name: "Pricing/Rates", description: "Fee structures, rates, and pricing models", riskWeight: "MEDIUM", categoryGroup: "COMMERCIAL", isMandatory: true },
  { code: "INV-001", name: "Invoicing Procedures", description: "Invoice submission and processing rules", riskWeight: "LOW", categoryGroup: "COMMERCIAL", isMandatory: false },
  { code: "TRV-001", name: "Travel & Expenses", description: "Expense reimbursement and travel policies", riskWeight: "LOW", categoryGroup: "COMMERCIAL", isMandatory: false },

  // Operational Clauses
  { code: "SVC-001", name: "Service Description", description: "Scope and nature of services", riskWeight: "MEDIUM", categoryGroup: "OPERATIONAL", isMandatory: true },
  { code: "WRK-001", name: "Working Hours", description: "Time commitments and scheduling", riskWeight: "LOW", categoryGroup: "OPERATIONAL", isMandatory: false },
  { code: "WRK-002", name: "Workplace Location", description: "Location requirements and remote work", riskWeight: "LOW", categoryGroup: "OPERATIONAL", isMandatory: false },
  { code: "TME-001", name: "Time Reporting", description: "Timesheet and reporting requirements", riskWeight: "LOW", categoryGroup: "OPERATIONAL", isMandatory: false },
  { code: "CON-001", name: "Consultant Obligations", description: "Duties and responsibilities of consultant", riskWeight: "MEDIUM", categoryGroup: "OPERATIONAL", isMandatory: true },
  { code: "CLI-001", name: "Client Obligations", description: "Duties and responsibilities of client", riskWeight: "MEDIUM", categoryGroup: "OPERATIONAL", isMandatory: false },
  { code: "RPL-001", name: "Replacement/Substitution", description: "Consultant replacement procedures", riskWeight: "MEDIUM", categoryGroup: "OPERATIONAL", isMandatory: false },
  { code: "SUB-001", name: "Subcontracting", description: "Subcontracting permissions and restrictions", riskWeight: "MEDIUM", categoryGroup: "OPERATIONAL", isMandatory: false },

  // Contract Lifecycle
  { code: "TRM-001", name: "Termination Rights", description: "Termination conditions and procedures", riskWeight: "HIGH", categoryGroup: "LIFECYCLE", isMandatory: true },
  { code: "TRM-002", name: "Notice Periods", description: "Required notice for various actions", riskWeight: "MEDIUM", categoryGroup: "LIFECYCLE", isMandatory: true },
  { code: "CHG-001", name: "Change Control", description: "Amendment and variation procedures", riskWeight: "MEDIUM", categoryGroup: "LIFECYCLE", isMandatory: false },
  { code: "AMD-001", name: "Amendment", description: "Contract modification provisions", riskWeight: "LOW", categoryGroup: "LIFECYCLE", isMandatory: false },
  { code: "ASN-001", name: "Assignment", description: "Assignment and transfer rights", riskWeight: "MEDIUM", categoryGroup: "LIFECYCLE", isMandatory: false },

  // Compliance & Risk
  { code: "NDA-001", name: "Confidentiality", description: "Non-disclosure and secrecy obligations", riskWeight: "HIGH", categoryGroup: "COMPLIANCE", isMandatory: true },
  { code: "SOL-001", name: "Non-Solicitation", description: "Non-solicitation of employees/clients", riskWeight: "MEDIUM", categoryGroup: "COMPLIANCE", isMandatory: false },
  { code: "INS-001", name: "Insurance Requirements", description: "Insurance coverage requirements", riskWeight: "MEDIUM", categoryGroup: "COMPLIANCE", isMandatory: false },
  { code: "CMP-001", name: "Compliance", description: "Regulatory and legal compliance", riskWeight: "MEDIUM", categoryGroup: "COMPLIANCE", isMandatory: false },
  { code: "SEC-001", name: "Security Requirements", description: "Security and access control", riskWeight: "MEDIUM", categoryGroup: "COMPLIANCE", isMandatory: false },
  { code: "BGC-001", name: "Background Checks", description: "Vetting and clearance requirements", riskWeight: "LOW", categoryGroup: "COMPLIANCE", isMandatory: false },
  { code: "AUD-001", name: "Audit Rights", description: "Audit and inspection provisions", riskWeight: "MEDIUM", categoryGroup: "COMPLIANCE", isMandatory: false },

  // Legal Framework
  { code: "GOV-001", name: "Governing Law", description: "Applicable law and jurisdiction", riskWeight: "HIGH", categoryGroup: "LEGAL_FRAMEWORK", isMandatory: true },
  { code: "DSR-001", name: "Dispute Resolution", description: "Dispute resolution mechanisms", riskWeight: "HIGH", categoryGroup: "LEGAL_FRAMEWORK", isMandatory: true },
  { code: "FM-001", name: "Force Majeure", description: "Force majeure and excusable delays", riskWeight: "MEDIUM", categoryGroup: "LEGAL_FRAMEWORK", isMandatory: false },
  { code: "WAR-001", name: "Warranty", description: "Warranty provisions and disclaimers", riskWeight: "MEDIUM", categoryGroup: "LEGAL_FRAMEWORK", isMandatory: false },
  { code: "REP-001", name: "Representations & Warranties", description: "Party representations and warranties", riskWeight: "MEDIUM", categoryGroup: "LEGAL_FRAMEWORK", isMandatory: false },

  // Boilerplate
  { code: "DEF-001", name: "Definitions", description: "Defined terms and interpretations", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: true },
  { code: "NOT-001", name: "Notices", description: "Notice delivery requirements", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "ENT-001", name: "Entire Agreement", description: "Integration and merger clauses", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "SEV-001", name: "Severability", description: "Severability provisions", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "WAI-001", name: "Waiver", description: "Waiver and forbearance", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "SUR-001", name: "Survival", description: "Survival of provisions", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "TAX-001", name: "Taxes", description: "Tax responsibilities and compliance", riskWeight: "MEDIUM", categoryGroup: "BOILERPLATE", isMandatory: false },
  { code: "REL-001", name: "Relationship of Parties", description: "Independent contractor status", riskWeight: "LOW", categoryGroup: "BOILERPLATE", isMandatory: true },
  { code: "ACC-001", name: "Acceptance Criteria", description: "Deliverable acceptance standards", riskWeight: "MEDIUM", categoryGroup: "BOILERPLATE", isMandatory: false },
];

// Generates rule field content from a clause category
function buildRuleFields(cat: ClauseCategory) {
  const riskLevel = mapRiskLevel(cat.riskWeight, cat.isMandatory);

  return {
    title: cat.name,
    description: cat.description,
    riskLevel,
    standardPosition: "",
    acceptableRange: "",
    escalationTrigger: "",
    negotiationGuidance: "",
    country: null as string | null,
  };
}

export async function seedRules() {
  console.log("\nSeeding playbook rules (44 clause categories)...");

  // Get or create the singleton playbook
  let playbook = await prisma.playbook.findFirst();
  if (!playbook) {
    playbook = await prisma.playbook.create({ data: {} });
    console.log("  Created singleton playbook");
  }

  // Load all groups by slug
  const groups = await prisma.playbookGroup.findMany();
  const slugToId = Object.fromEntries(groups.map((g: any) => [g.slug, g.id]));

  if (groups.length === 0) {
    console.error("  ERROR: No playbook groups found. Run the groups seed first.");
    return;
  }

  // Get or create a system user for seeded rules
  let systemUser = await prisma.user.findFirst({
    where: { email: "system@legal-ai.internal" },
  });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: "system@legal-ai.internal",
        name: "System",
        password: "---", // Not a real login
        role: "admin",
      },
    });
    console.log("  Created system user for seeded rules");
  }

  // Clear existing rules to start fresh
  const deleted = await prisma.playbookRule.deleteMany({
    where: { playbookId: playbook.id },
  });
  if (deleted.count > 0) {
    console.log(`  Cleared ${deleted.count} existing rule(s)`);
  }

  // Create all 44 rules
  let created = 0;
  for (const cat of CLAUSE_CATEGORIES) {
    const groupSlug = GROUP_SLUG_MAP[cat.categoryGroup];
    const groupId = groupSlug ? slugToId[groupSlug] : null;

    if (!groupId) {
      console.warn(`  WARNING: No group found for ${cat.categoryGroup} (slug: ${groupSlug}). Skipping ${cat.code}.`);
      continue;
    }

    const fields = buildRuleFields(cat);

    await prisma.playbookRule.create({
      data: {
        playbookId: playbook.id,
        groupId,
        title: fields.title,
        description: fields.description,
        country: fields.country,
        riskLevel: fields.riskLevel,
        standardPosition: fields.standardPosition,
        acceptableRange: fields.acceptableRange,
        escalationTrigger: fields.escalationTrigger,
        negotiationGuidance: fields.negotiationGuidance,
        createdBy: systemUser.id,
        updatedBy: systemUser.id,
      },
    });
    created++;
  }

  // Bump playbook version and create initial snapshot
  const newVersion = playbook.version + 1;
  await prisma.playbook.update({
    where: { id: playbook.id },
    data: { version: newVersion, updatedBy: systemUser.id },
  });

  const activeRules = await prisma.playbookRule.findMany({
    where: { playbookId: playbook.id, deleted: false },
    orderBy: { createdAt: "asc" },
  });

  const groupNameMap = Object.fromEntries(groups.map((g: any) => [g.id, g.name]));

  const snapshot = await prisma.playbookSnapshot.create({
    data: {
      playbookId: playbook.id,
      version: newVersion,
      createdBy: systemUser.id,
    },
  });

  await prisma.playbookSnapshotRule.createMany({
    data: activeRules.map((rule: any) => ({
      snapshotId: snapshot.id,
      title: rule.title,
      description: rule.description,
      country: rule.country,
      riskLevel: rule.riskLevel,
      groupId: rule.groupId,
      groupName: rule.groupId ? groupNameMap[rule.groupId] || null : null,
      standardPosition: rule.standardPosition,
      acceptableRange: rule.acceptableRange,
      escalationTrigger: rule.escalationTrigger,
      negotiationGuidance: rule.negotiationGuidance,
      originalRuleId: rule.id,
      createdBy: rule.createdBy,
      originalCreatedAt: rule.createdAt,
    })),
  });

  console.log(`  Created ${created} rules across ${groups.length} groups`);
  console.log(`  Saved as playbook v${newVersion} with snapshot`);

  // Summary by group
  for (const g of groups) {
    const count = activeRules.filter((r: any) => r.groupId === g.id).length;
    if (count > 0) {
      console.log(`    ${g.name}: ${count} rules`);
    }
  }
}

// Allow running standalone: npx tsx prisma/seed-rules.ts
if (require.main === module) {
  seedRules()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
