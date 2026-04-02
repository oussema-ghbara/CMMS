import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  await prisma.user.upsert({
    where: { email: 'admin@gmao.local' },
    update: {},
    create: {
      email: 'admin@gmao.local',
      name: 'Administrateur',
      passwordHash,
      roles: [Role.ADMIN],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'supervisor@gmao.local' },
    update: {},
    create: {
      email: 'supervisor@gmao.local',
      name: 'Superviseur Test',
      passwordHash,
      roles: [Role.SUPERVISOR, Role.STOREKEEPER],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'tech@gmao.local' },
    update: {},
    create: {
      email: 'tech@gmao.local',
      name: 'Technicien Test',
      passwordHash,
      roles: [Role.TECHNICIAN],
      isActive: true,
    },
  });

  console.log('Seed complete — 3 users created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());