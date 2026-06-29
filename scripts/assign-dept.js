const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const depts = await p.department.findMany({ select: { id: true, name: true, code: true } });
  console.log('DEPARTMENTS:', JSON.stringify(depts));

  // Assign the unassigned account to the first available department
  const targetUserId = 'cmpy8fvub000264fpgvjbhw6v';
  const user = await p.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, role: true, departmentId: true } });
  console.log('USER:', JSON.stringify(user));

  if (depts.length > 0) {
    const updated = await p.user.update({
      where: { id: targetUserId },
      data: { departmentId: depts[0].id },
      select: { id: true, email: true, role: true, departmentId: true }
    });
    console.log('UPDATED USER:', JSON.stringify(updated));
  }
}

main().then(() => p.$disconnect()).catch(e => { console.error(e.message); p.$disconnect(); process.exit(1); });
