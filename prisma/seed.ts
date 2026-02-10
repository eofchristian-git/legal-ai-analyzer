import { PrismaClient } from "@prisma/client";
import { seedRules } from "./seed-rules";

const prisma = new PrismaClient();

const GROUPS = [
  { sortOrder: 1, name: "Core Legal", slug: "core-legal", description: "Fundamental legal provisions \u2014 liability, indemnification, IP, warranties" },
  { sortOrder: 2, name: "Compliance", slug: "compliance", description: "Regulatory and compliance requirements \u2014 data protection, anti-bribery, export controls" },
  { sortOrder: 3, name: "Commercial", slug: "commercial", description: "Business and financial terms \u2014 pricing, payment, SLAs, performance" },
  { sortOrder: 4, name: "Operational", slug: "operational", description: "Day-to-day operational clauses \u2014 reporting, audit rights, subcontracting" },
  { sortOrder: 5, name: "Contract Lifecycle", slug: "contract-lifecycle", description: "Term, renewal, termination, transition, and exit provisions" },
  { sortOrder: 6, name: "Legal Framework", slug: "legal-framework", description: "Governing law, dispute resolution, jurisdiction, force majeure" },
  { sortOrder: 7, name: "Boilerplate", slug: "boilerplate", description: "Standard clauses \u2014 notices, amendments, severability, entire agreement" },
];

async function main() {
  console.log("Seeding playbook groups...");

  for (const group of GROUPS) {
    await prisma.playbookGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name, sortOrder: group.sortOrder, description: group.description },
      create: group,
    });
  }

  // Assign orphan rules (groupId=null) to Boilerplate
  const boilerplate = await prisma.playbookGroup.findUnique({
    where: { slug: "boilerplate" },
  });

  if (boilerplate) {
    const updated = await prisma.playbookRule.updateMany({
      where: { groupId: null },
      data: { groupId: boilerplate.id },
    });
    console.log(
      `Assigned ${updated.count} orphan rule(s) to Boilerplate group`
    );
  }

  const groups = await prisma.playbookGroup.findMany({
    orderBy: { sortOrder: "asc" },
  });
  console.log(`Seeded ${groups.length} groups:`);
  for (const g of groups) {
    console.log(`  ${g.sortOrder}. ${g.name} (${g.slug})`);
  }

  // Seed the 44 clause category rules
  await seedRules();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
