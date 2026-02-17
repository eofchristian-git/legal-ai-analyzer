#!/usr/bin/env tsx
/**
 * Data Migration Script: Copy clauseText to originalText
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Purpose: Populate the new originalText field for all existing AnalysisClause records.
 * This establishes the baseline for projection engine to compute tracked changes.
 * 
 * Run: npx tsx scripts/migrate-original-text.ts
 */

import { db as prisma } from '../src/lib/db';

async function main() {
  console.log('🔄 Starting data migration: clauseText → originalText...\n');

  // Find all clauses without originalText set
  const clausesToMigrate = await prisma.analysisClause.findMany({
    where: {
      originalText: null,
      clauseText: { not: null }, // Only migrate clauses that have clauseText
    },
    select: {
      id: true,
      clauseText: true,
      clauseName: true,
    },
  });

  console.log(`📊 Found ${clausesToMigrate.length} clauses to migrate\n`);

  if (clausesToMigrate.length === 0) {
    console.log('✅ No migration needed. All clauses already have originalText set.');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  // Migrate each clause
  for (const clause of clausesToMigrate) {
    try {
      await prisma.analysisClause.update({
        where: { id: clause.id },
        data: { originalText: clause.clauseText },
      });
      successCount++;
      
      if (successCount % 10 === 0) {
        console.log(`   ... migrated ${successCount} clauses`);
      }
    } catch (error) {
      console.error(`❌ Error migrating clause ${clause.id} (${clause.clauseName}):`, error);
      errorCount++;
    }
  }

  console.log('\n📈 Migration Summary:');
  console.log(`   ✅ Successfully migrated: ${successCount} clauses`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} clauses`);
  }
  console.log('');

  if (errorCount === 0) {
    console.log('✅ Data migration completed successfully!');
  } else {
    console.warn('⚠️  Migration completed with errors. Please review the logs above.');
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('💥 Fatal error during migration:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
