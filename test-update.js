const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Just find one open report
    const report = await prisma.report.findFirst({ where: { status: 'OPEN' } });
    if (!report) {
      console.log('No OPEN reports found');
      return;
    }
    
    console.log(`Found report ${report.id}, attempting update...`);
    
    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: 'Test Script',
      }
    });
    console.log('Update successful:', updated.id);
  } catch (e) {
    console.error('Update failed:');
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
