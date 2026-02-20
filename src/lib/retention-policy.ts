// Feature 008: Interactive Document Viewer & Redline Export
// Data retention policy for HTML documents and position data (T058, T059)

import { db } from '@/lib/db';

const RETENTION_DAYS_DRAFT = 90; // Days to retain HTML for non-finalized contracts

/**
 * T058: Clean up old ContractDocument HTML content for draft/cancelled contracts.
 *
 * Retention rules:
 * - Finalized contracts: retain indefinitely
 * - Draft, pending, error, cancelled contracts: delete HTML after 90 days
 *   (position data also cleared to free storage)
 *
 * Note: The ContractDocument record itself is kept; only htmlContent and
 * clausePositions/findingPositions are cleared to save storage.
 */
export async function cleanupOldDocuments(): Promise<{
  checked: number;
  cleaned: number;
  errors: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS_DRAFT);

  let checked = 0;
  let cleaned = 0;
  let errors = 0;

  // Find contracts where:
  // 1. Analysis is NOT finalized (or no analysis)
  // 2. Status is not 'finalized'
  // 3. ContractDocument exists with HTML content
  // 4. Created more than 90 days ago
  const contractDocs = await db.contractDocument.findMany({
    where: {
      htmlContent: { not: null },
      createdAt: { lt: cutoffDate },
      contract: {
        status: { notIn: ['finalized'] },
        analysis: {
          is: {
            finalized: false,
          },
        },
      },
    },
    select: {
      id: true,
      contractId: true,
      createdAt: true,
    },
  });

  checked = contractDocs.length;

  for (const doc of contractDocs) {
    try {
      await db.contractDocument.update({
        where: { id: doc.id },
        data: {
          htmlContent: null,
          clausePositions: '[]',
          findingPositions: '[]',
          conversionStatus: 'expired',
        },
      });
      cleaned++;
    } catch (error) {
      console.error(`Failed to clean document ${doc.id}:`, error);
      errors++;
    }
  }

  console.log(
    `[RetentionPolicy] Checked: ${checked}, Cleaned: ${cleaned}, Errors: ${errors}`
  );

  return { checked, cleaned, errors };
}

/**
 * T059: Check if a contract document is eligible for retention cleanup
 */
export function isEligibleForCleanup(
  createdAt: Date,
  isFinalized: boolean,
  status: string
): boolean {
  if (isFinalized) return false;
  if (status === 'finalized') return false;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS_DRAFT);

  return createdAt < cutoffDate;
}
