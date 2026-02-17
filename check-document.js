// Quick diagnostic script to check document conversion status
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkDocument() {
  const contractId = 'cmlr2fk4j0002kibykz1oimoc';
  
  const doc = await db.contractDocument.findUnique({
    where: { contractId },
  });
  
  if (!doc) {
    console.log('❌ No ContractDocument record found');
    return;
  }
  
  console.log('✅ ContractDocument found:');
  console.log('  - ID:', doc.id);
  console.log('  - Conversion Status:', doc.conversionStatus);
  console.log('  - Page Count:', doc.pageCount);
  console.log('  - HTML Content length:', doc.htmlContent?.length || 0);
  console.log('  - HTML Content preview:', doc.htmlContent?.substring(0, 200) || 'null');
  console.log('  - Clause Positions:', doc.clausePositions);
  console.log('  - Finding Positions:', doc.findingPositions);
  console.log('  - Conversion Error:', doc.conversionError || 'none');
  
  await db.$disconnect();
}

checkDocument().catch(console.error);
