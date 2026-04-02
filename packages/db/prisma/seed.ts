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

  // ── System config defaults (spec §6.2) ──────────────────────────
  const configs: Array<{ key: string; value: string; description: string }> = [
    {
      key: 'PASSWORD_MIN_LENGTH',
      value: '8',
      description: 'Longueur minimale du mot de passe',
    },
    {
      key: 'PASSWORD_REQUIRE_UPPERCASE',
      value: 'true',
      description: 'Le mot de passe doit contenir au moins une majuscule',
    },
    {
      key: 'PASSWORD_REQUIRE_NUMBER',
      value: 'true',
      description: 'Le mot de passe doit contenir au moins un chiffre',
    },
    {
      key: 'PASSWORD_REQUIRE_SPECIAL',
      value: 'true',
      description: 'Le mot de passe doit contenir au moins un caractère spécial',
    },
    {
      key: 'SESSION_IDLE_TIMEOUT_HOURS',
      value: '8',
      description: "Délai d'inactivité de session en heures",
    },
    {
      key: 'ESCALATION_CHECK_FREQUENCY_MINUTES',
      value: '60',
      description: "Fréquence de vérification de l'escalade automatique en minutes",
    },
    {
      key: 'DAILY_SUMMARY_HOUR',
      value: '17',
      description: "Heure d'envoi du résumé quotidien (0-23)",
    },
    {
      key: 'RECURRING_FAULT_THRESHOLD_COUNT',
      value: '3',
      description: 'Nombre de pannes déclenchant le seuil de pannes récurrentes',
    },
    {
      key: 'RECURRING_FAULT_THRESHOLD_DAYS',
      value: '30',
      description: 'Fenêtre en jours pour le seuil de pannes récurrentes',
    },
    {
      key: 'DEFERRED_REPORT_AGING_DAYS',
      value: '7',
      description: 'Jours avant que les rapports différés entrent en état de vieillissement',
    },
    {
      key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS',
      value: '7',
      description: 'Fenêtre en jours pour détecter les OT correctifs post-préventifs',
    },
    {
      key: 'DEAD_STOCK_THRESHOLD_DAYS',
      value: '90',
      description: 'Jours sans mouvement sortant avant signalement comme stock mort',
    },
    {
      key: 'REORDER_SIGNAL_THRESHOLD_COUNT',
      value: '2',
      description: 'Nombre de baisses sous le seuil minimum déclenchant le signal de réapprovisionnement',
    },
    {
      key: 'INACTIVE_USER_THRESHOLD_DAYS',
      value: '30',
      description: "Jours sans connexion avant signalement comme compte inactif",
    },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('Seed complete — 3 users, 14 config entries created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());