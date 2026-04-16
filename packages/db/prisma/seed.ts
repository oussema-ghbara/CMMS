import {
  AssignmentRole,
  AssetCriticality,
  AssetStatus,
  ChecklistItemStatus,
  ChecklistTaskType,
  NotificationType,
  PartRequestStatus,
  PartUnit,
  PreventiveFrequencyType,
  ProblemReportStatus,
  PrismaClient,
  Role,
  StockMovementType,
  UrgencyPerception,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureLocation(params: {
  name: string;
  level: number;
  fullPath: string;
  code?: string;
  description?: string;
  parentId?: string;
}) {
  const existing = await prisma.location.findFirst({
    where: { fullPath: params.fullPath },
  });

  if (existing) {
    return existing;
  }

  return prisma.location.create({
    data: {
      name: params.name,
      level: params.level,
      fullPath: params.fullPath,
      code: params.code,
      description: params.description,
      parentId: params.parentId,
    },
  });
}

async function ensureCategory(name: string, description: string) {
  const existing = await prisma.assetCategory.findFirst({
    where: { name },
  });

  if (existing) {
    return existing;
  }

  return prisma.assetCategory.create({
    data: {
      name,
      description,
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gmao.local' },
    update: {
      name: 'Administrateur',
      roles: [Role.ADMIN],
      isActive: true,
    },
    create: {
      email: 'admin@gmao.local',
      name: 'Administrateur',
      passwordHash,
      roles: [Role.ADMIN],
      isActive: true,
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@gmao.local' },
    update: {
      name: 'Superviseur Test',
      roles: [Role.SUPERVISOR, Role.STOREKEEPER],
      isActive: true,
    },
    create: {
      email: 'supervisor@gmao.local',
      name: 'Superviseur Test',
      passwordHash,
      roles: [Role.SUPERVISOR, Role.STOREKEEPER],
      isActive: true,
    },
  });

  const tech = await prisma.user.upsert({
    where: { email: 'tech@gmao.local' },
    update: {
      name: 'Technicien Test',
      roles: [Role.TECHNICIAN],
      isActive: true,
    },
    create: {
      email: 'tech@gmao.local',
      name: 'Technicien Test',
      passwordHash,
      roles: [Role.TECHNICIAN],
      isActive: true,
    },
  });

  const tech2 = await prisma.user.upsert({
    where: { email: 'tech2@gmao.local' },
    update: {
      name: 'Technicien Backup',
      roles: [Role.TECHNICIAN],
      isActive: true,
    },
    create: {
      email: 'tech2@gmao.local',
      name: 'Technicien Backup',
      passwordHash,
      roles: [Role.TECHNICIAN],
      isActive: true,
    },
  });

  const requester = await prisma.user.upsert({
    where: { email: 'requester@gmao.local' },
    update: {
      name: 'Demandeur Test',
      roles: [Role.REQUESTER],
      isActive: true,
    },
    create: {
      email: 'requester@gmao.local',
      name: 'Demandeur Test',
      passwordHash,
      roles: [Role.REQUESTER],
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

  const site = await ensureLocation({
    name: 'Usine Centrale',
    level: 1,
    fullPath: 'Usine Centrale',
    code: 'SITE-01',
    description: 'Site principal de production',
  });

  const atelierA = await ensureLocation({
    name: 'Atelier A',
    level: 2,
    fullPath: 'Usine Centrale / Atelier A',
    code: 'ATL-A',
    parentId: site.id,
  });

  const atelierB = await ensureLocation({
    name: 'Atelier B',
    level: 2,
    fullPath: 'Usine Centrale / Atelier B',
    code: 'ATL-B',
    parentId: site.id,
  });

  const coldRoom = await ensureLocation({
    name: 'Chambre Froid',
    level: 3,
    fullPath: 'Usine Centrale / Atelier B / Chambre Froid',
    code: 'COLD-01',
    parentId: atelierB.id,
  });

  const rotatingMachines = await ensureCategory(
    'Machines tournantes',
    'Pompes, compresseurs, moteurs et ventilateurs',
  );
  const hvac = await ensureCategory(
    'CVC',
    'Equipements de ventilation et climatisation',
  );

  await prisma.checklistTemplateItem.upsert({
    where: {
      id: `${rotatingMachines.id}-tmpl-01`,
    },
    update: {},
    create: {
      id: `${rotatingMachines.id}-tmpl-01`,
      categoryId: rotatingMachines.id,
      description: 'Verifier les vibrations et bruits anormaux',
      taskType: ChecklistTaskType.INSPECTION,
      expectedCondition: 'Aucune vibration anormale',
      isMandatory: true,
      sortOrder: 1,
    },
  });

  const compressor = await prisma.asset.upsert({
    where: { qrCodeIdentifier: 'QR-COMP-001' },
    update: {},
    create: {
      name: 'Compresseur Atlas 30kW',
      description: 'Compresseur principal ligne A',
      serialNumber: 'SN-COMP-001',
      manufacturer: 'Atlas Copco',
      model: 'GA30',
      installationDate: new Date('2023-01-10T08:00:00.000Z'),
      warrantyExpiration: new Date('2027-01-10T08:00:00.000Z'),
      qrCodeIdentifier: 'QR-COMP-001',
      categoryId: rotatingMachines.id,
      locationId: atelierA.id,
      criticality: AssetCriticality.CRITICAL,
      status: AssetStatus.OPERATIONAL,
    },
  });

  const extractionFan = await prisma.asset.upsert({
    where: { qrCodeIdentifier: 'QR-FAN-001' },
    update: {},
    create: {
      name: 'Ventilateur extraction B',
      description: 'Ventilation zone atelier B',
      serialNumber: 'SN-FAN-001',
      manufacturer: 'Ziehl-Abegg',
      model: 'ZAplus',
      qrCodeIdentifier: 'QR-FAN-001',
      categoryId: hvac.id,
      locationId: atelierB.id,
      criticality: AssetCriticality.STANDARD,
      status: AssetStatus.OPERATIONAL,
    },
  });

  const coldUnit = await prisma.asset.upsert({
    where: { qrCodeIdentifier: 'QR-COLD-001' },
    update: {},
    create: {
      name: 'Unite de froid CF-01',
      description: 'Unite de refroidissement chambre froide',
      serialNumber: 'SN-COLD-001',
      manufacturer: 'Daikin',
      model: 'CR-500',
      qrCodeIdentifier: 'QR-COLD-001',
      categoryId: hvac.id,
      locationId: coldRoom.id,
      criticality: AssetCriticality.CRITICAL,
      status: AssetStatus.IN_MAINTENANCE,
    },
  });

  const closedWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000106' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000106',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.CLOSED,
      priority: WorkOrderPriority.HIGH,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Fuite d huile resolue sur compresseur principal',
      capturedLocationPath: atelierA.fullPath,
      assetId: compressor.id,
      createdById: supervisor.id,
      principalTechnicianId: tech.id,
      validatedById: supervisor.id,
      validatedAt: new Date('2026-04-15T13:30:00.000Z'),
      closedAt: new Date('2026-04-15T13:30:00.000Z'),
    },
  });

  const pendingValidationWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000105' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000105',
      type: WorkOrderType.PREVENTIVE,
      status: WorkOrderStatus.PENDING_VALIDATION,
      priority: WorkOrderPriority.MEDIUM,
      sourceType: WorkOrderSource.PREVENTIVE_PLAN,
      description: 'Inspection preventive mensuelle compresseur',
      capturedLocationPath: atelierA.fullPath,
      assetId: compressor.id,
      createdById: supervisor.id,
      principalTechnicianId: tech.id,
    },
  });

  const inProgressWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000104' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000104',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.CRITICAL,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Arret intermittent unite de froid CF-01',
      capturedLocationPath: coldRoom.fullPath,
      assetId: coldUnit.id,
      createdById: supervisor.id,
      principalTechnicianId: tech2.id,
      dueDate: new Date('2026-04-18T16:00:00.000Z'),
    },
  });

  const assignedWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000103' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000103',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.ASSIGNED,
      priority: WorkOrderPriority.HIGH,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Bruit anormal ventilateur extraction B',
      capturedLocationPath: atelierB.fullPath,
      assetId: extractionFan.id,
      createdById: supervisor.id,
      principalTechnicianId: tech.id,
    },
  });

  const openWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000102' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000102',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.OPEN,
      priority: WorkOrderPriority.MEDIUM,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Controle capteur temperature chambre froide',
      capturedLocationPath: coldRoom.fullPath,
      assetId: coldUnit.id,
      createdById: supervisor.id,
    },
  });

  const draftWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000101' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000101',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.DRAFT,
      priority: WorkOrderPriority.LOW,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Nettoyage filtre admission air',
      capturedLocationPath: atelierA.fullPath,
      assetId: compressor.id,
      createdById: supervisor.id,
    },
  });

  const onHoldWo = await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000107' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000107',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.ON_HOLD,
      priority: WorkOrderPriority.HIGH,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Remplacement roulement ventilation B',
      capturedLocationPath: atelierB.fullPath,
      assetId: extractionFan.id,
      createdById: supervisor.id,
      principalTechnicianId: tech2.id,
    },
  });

  await prisma.workOrder.upsert({
    where: { referenceNumber: 'WO-2026-000108' },
    update: {},
    create: {
      referenceNumber: 'WO-2026-000108',
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.CANCELLED,
      priority: WorkOrderPriority.LOW,
      sourceType: WorkOrderSource.DIRECT_CREATION,
      description: 'Demande annulee apres verification terrain',
      capturedLocationPath: atelierA.fullPath,
      assetId: compressor.id,
      createdById: supervisor.id,
      cancelledById: supervisor.id,
      cancelledAt: new Date('2026-04-12T10:15:00.000Z'),
    },
  });

  const assignedPrincipal = await prisma.workOrderAssignment.findFirst({
    where: {
      workOrderId: assignedWo.id,
      technicianId: tech.id,
      role: AssignmentRole.PRINCIPAL,
      isActive: true,
    },
  });

  if (!assignedPrincipal) {
    await prisma.workOrderAssignment.create({
      data: {
        workOrderId: assignedWo.id,
        technicianId: tech.id,
        role: AssignmentRole.PRINCIPAL,
      },
    });
  }

  const assignedContributor = await prisma.workOrderAssignment.findFirst({
    where: {
      workOrderId: assignedWo.id,
      technicianId: tech2.id,
      role: AssignmentRole.CONTRIBUTOR,
      isActive: true,
    },
  });

  if (!assignedContributor) {
    await prisma.workOrderAssignment.create({
      data: {
        workOrderId: assignedWo.id,
        technicianId: tech2.id,
        role: AssignmentRole.CONTRIBUTOR,
      },
    });
  }

  const pendingChecklist = await prisma.workOrderChecklistItem.findFirst({
    where: {
      workOrderId: pendingValidationWo.id,
      sortOrder: 1,
      description: 'Verifier pression de service',
    },
  });

  if (!pendingChecklist) {
    await prisma.workOrderChecklistItem.createMany({
      data: [
        {
          workOrderId: pendingValidationWo.id,
          description: 'Verifier pression de service',
          taskType: ChecklistTaskType.MEASUREMENT,
          expectedCondition: '7.5 bar +/- 0.2 bar',
          isMandatory: true,
          sortOrder: 1,
          status: ChecklistItemStatus.DONE,
          completedById: tech.id,
          completedAt: new Date('2026-04-15T10:00:00.000Z'),
        },
        {
          workOrderId: pendingValidationWo.id,
          description: 'Nettoyer filtre air',
          taskType: ChecklistTaskType.CLEANING,
          expectedCondition: 'Filtre propre et sec',
          isMandatory: true,
          sortOrder: 2,
          status: ChecklistItemStatus.DONE,
          completedById: tech.id,
          completedAt: new Date('2026-04-15T10:20:00.000Z'),
        },
      ],
    });
  }

  const intervention = await prisma.interventionLog.findFirst({
    where: {
      workOrderId: inProgressWo.id,
      technicianId: tech2.id,
    },
  });

  if (!intervention) {
    const createdIntervention = await prisma.interventionLog.create({
      data: {
        workOrderId: inProgressWo.id,
        technicianId: tech2.id,
        startedAt: new Date('2026-04-16T08:00:00.000Z'),
        activeDurationMinutes: 85,
      },
    });

    await prisma.interventionAction.createMany({
      data: [
        {
          interventionId: createdIntervention.id,
          actionType: 'INSPECTION',
          detail: 'Verification de la ligne frigorifique et des capteurs',
        },
        {
          interventionId: createdIntervention.id,
          actionType: 'REPLACEMENT',
          detail: 'Remplacement du contacteur principal',
        },
      ],
    });
  }

  const bearingPart = await prisma.part.upsert({
    where: { referenceCode: 'PART-BEARING-6205' },
    update: {},
    create: {
      name: 'Roulement 6205',
      referenceCode: 'PART-BEARING-6205',
      description: 'Roulement standard moteur ventilation',
      unit: PartUnit.PIECE,
      currentStock: 18,
      minimumStockThreshold: 6,
      warehouseLocation: 'A-01-03',
      unitCost: 24.5,
    },
  });

  const filterPart = await prisma.part.upsert({
    where: { referenceCode: 'PART-FILTER-AIR-30' },
    update: {},
    create: {
      name: 'Filtre admission air 30kW',
      referenceCode: 'PART-FILTER-AIR-30',
      description: 'Filtre pour compresseur 30kW',
      unit: PartUnit.PIECE,
      currentStock: 9,
      minimumStockThreshold: 4,
      warehouseLocation: 'B-02-01',
      unitCost: 58,
    },
  });

  const refrigerantPart = await prisma.part.upsert({
    where: { referenceCode: 'PART-R134A-13KG' },
    update: {},
    create: {
      name: 'Gaz refrigerant R134a 13kg',
      referenceCode: 'PART-R134A-13KG',
      description: 'Bouteille gaz refrigerant',
      unit: PartUnit.PIECE,
      currentStock: 2,
      minimumStockThreshold: 3,
      warehouseLocation: 'C-01-02',
      unitCost: 180,
    },
  });

  const pendingPartRequest = await prisma.partRequest.findFirst({
    where: {
      workOrderId: onHoldWo.id,
      note: '[seed] roulement urgent ventilateur',
    },
  });

  if (!pendingPartRequest) {
    await prisma.partRequest.create({
      data: {
        workOrderId: onHoldWo.id,
        requesterId: tech2.id,
        partId: bearingPart.id,
        quantityRequested: 2,
        status: PartRequestStatus.PENDING,
        note: '[seed] roulement urgent ventilateur',
      },
    });
  }

  const fulfilledPartRequest = await prisma.partRequest.findFirst({
    where: {
      workOrderId: closedWo.id,
      note: '[seed] filtre remplace maintenance',
    },
  });

  if (!fulfilledPartRequest) {
    const createdRequest = await prisma.partRequest.create({
      data: {
        workOrderId: closedWo.id,
        requesterId: tech.id,
        partId: filterPart.id,
        quantityRequested: 1,
        quantityFulfilled: 1,
        status: PartRequestStatus.FULFILLED,
        processedById: supervisor.id,
        processedAt: new Date('2026-04-15T11:00:00.000Z'),
        note: '[seed] filtre remplace maintenance',
      },
    });

    await prisma.stockMovement.create({
      data: {
        partId: filterPart.id,
        type: StockMovementType.OUTGOING,
        quantity: 1,
        unitCostAtTime: 58,
        workOrderId: closedWo.id,
        partRequestId: createdRequest.id,
        performedById: supervisor.id,
        note: '[seed] sortie piece pour WO close',
      },
    });
  }

  const preventivePlan = await prisma.preventivePlan.findFirst({
    where: {
      assetId: compressor.id,
      title: 'PM mensuelle compresseur principal',
    },
  });

  const plan =
    preventivePlan ??
    (await prisma.preventivePlan.create({
      data: {
        assetId: compressor.id,
        title: 'PM mensuelle compresseur principal',
        description: 'Controle mensuel general du compresseur principal',
        frequencyType: PreventiveFrequencyType.FIXED_INTERVAL_DAYS,
        intervalDays: 30,
        estimatedDurationMinutes: 90,
        defaultTechnicianId: tech.id,
        isActive: true,
        nextDueAt: new Date('2026-04-23T08:00:00.000Z'),
      },
    }));

  const existingPlanChecklist = await prisma.preventivePlanChecklistItem.findFirst({
    where: { planId: plan.id, sortOrder: 1 },
  });

  if (!existingPlanChecklist) {
    await prisma.preventivePlanChecklistItem.createMany({
      data: [
        {
          planId: plan.id,
          description: 'Verifier niveau huile',
          taskType: ChecklistTaskType.INSPECTION,
          expectedCondition: 'Entre min et max',
          isMandatory: true,
          sortOrder: 1,
        },
        {
          planId: plan.id,
          description: 'Nettoyer les ailettes de refroidissement',
          taskType: ChecklistTaskType.CLEANING,
          expectedCondition: 'Ailettes propres',
          isMandatory: true,
          sortOrder: 2,
        },
      ],
    });
  }

  await prisma.problemReport.upsert({
    where: { referenceNumber: 'PR-2026-000201' },
    update: {},
    create: {
      referenceNumber: 'PR-2026-000201',
      assetId: extractionFan.id,
      reporterId: requester.id,
      description: 'Le ventilateur s arrete pendant 5 secondes puis redemarre',
      urgencyPerception: UrgencyPerception.ABNORMAL_BEHAVIOR,
      status: ProblemReportStatus.PENDING,
    },
  });

  await prisma.problemReport.upsert({
    where: { referenceNumber: 'PR-2026-000202' },
    update: {},
    create: {
      referenceNumber: 'PR-2026-000202',
      assetId: coldUnit.id,
      reporterId: requester.id,
      description: 'Temperature instable depuis ce matin',
      urgencyPerception: UrgencyPerception.MACHINE_STOPPED,
      status: ProblemReportStatus.DEFERRED,
      deferredAt: new Date('2026-04-14T09:00:00.000Z'),
      deferNote: 'Attente intervention electricien externe',
      processedById: supervisor.id,
      processedAt: new Date('2026-04-14T09:00:00.000Z'),
    },
  });

  const unreadSupervisorNotif = await prisma.notification.findFirst({
    where: {
      recipientId: supervisor.id,
      title: 'WO en attente de validation',
      entityId: pendingValidationWo.id,
    },
  });

  if (!unreadSupervisorNotif) {
    await prisma.notification.create({
      data: {
        recipientId: supervisor.id,
        type: NotificationType.WO_PENDING_VALIDATION,
        title: 'WO en attente de validation',
        summary: 'WO-2026-000105 attend la validation du superviseur.',
        entityType: 'WORK_ORDER',
        entityId: pendingValidationWo.id,
      },
    });
  }

  const unreadStorekeeperNotif = await prisma.notification.findFirst({
    where: {
      recipientId: supervisor.id,
      title: 'Demande de piece en attente',
      entityId: onHoldWo.id,
    },
  });

  if (!unreadStorekeeperNotif) {
    await prisma.notification.create({
      data: {
        recipientId: supervisor.id,
        type: NotificationType.NEW_PART_REQUEST,
        title: 'Demande de piece en attente',
        summary: 'Une demande de piece est en attente pour WO-2026-000107.',
        entityType: 'WORK_ORDER',
        entityId: onHoldWo.id,
      },
    });
  }

  console.log('Seed complete — demo users, assets, work orders, inventory, plans, reports and notifications created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());