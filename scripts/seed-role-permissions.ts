#!/usr/bin/env tsx
/**
 * Seed Script: Role-Permission Mappings
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Purpose: Initialize role-permission mappings for RBAC system.
 * 
 * Default Permissions:
 * - admin: ALL permissions (full access)
 * - legal: REVIEW_CONTRACTS + APPROVE_ESCALATIONS (core reviewer role)
 * - compliance: NONE (explicitly excluded from contract review per spec)
 * 
 * Run: npx tsx scripts/seed-role-permissions.ts
 */

import { db as prisma } from '../src/lib/db';

// Define default role-permission mappings
const DEFAULT_PERMISSIONS = [
  // Admin: Full access to all features
  { role: 'admin', permission: 'REVIEW_CONTRACTS' },
  { role: 'admin', permission: 'APPROVE_ESCALATIONS' },
  { role: 'admin', permission: 'MANAGE_USERS' },
  { role: 'admin', permission: 'MANAGE_PLAYBOOK' },
  
  // Legal: Core contract review capabilities
  { role: 'legal', permission: 'REVIEW_CONTRACTS' },
  { role: 'legal', permission: 'APPROVE_ESCALATIONS' },
  
  // Compliance: No contract review access (per Feature 006 spec)
  // Compliance role intentionally has no permissions for this feature
];

async function main() {
  console.log('🔐 Seeding Role-Permission mappings...\n');

  let createdCount = 0;
  let skippedCount = 0;

  for (const mapping of DEFAULT_PERMISSIONS) {
    try {
      // Use upsert to avoid duplicates (idempotent operation)
      await prisma.rolePermission.upsert({
        where: {
          role_permission: {
            role: mapping.role,
            permission: mapping.permission,
          },
        },
        update: {}, // No updates if already exists
        create: mapping,
      });
      
      console.log(`   ✅ ${mapping.role.padEnd(12)} → ${mapping.permission}`);
      createdCount++;
    } catch (error) {
      console.error(`   ❌ Failed to create ${mapping.role} → ${mapping.permission}:`, error);
      skippedCount++;
    }
  }

  console.log('\n📊 Seed Summary:');
  console.log(`   Created/Verified: ${createdCount} permission mappings`);
  if (skippedCount > 0) {
    console.log(`   Skipped (errors): ${skippedCount} mappings`);
  }
  
  console.log('\n📋 Current Role-Permission Mappings:');
  const allPermissions = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { permission: 'asc' }],
  });
  
  const grouped = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.role]) acc[perm.role] = [];
    acc[perm.role].push(perm.permission);
    return acc;
  }, {} as Record<string, string[]>);
  
  for (const [role, permissions] of Object.entries(grouped)) {
    console.log(`   ${role}: [${permissions.join(', ')}]`);
  }
  
  console.log('\n✅ Role-Permission seeding completed!');
}

main()
  .catch((error) => {
    console.error('💥 Fatal error during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
