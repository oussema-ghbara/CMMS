import { Prisma } from '@gmao/db';

const SEQUENCE_PAD = 6;
const WO_LOCK_NAMESPACE = 10_001;
const PR_LOCK_NAMESPACE = 10_002;

async function acquireSequenceLock(
  tx: Prisma.TransactionClient,
  namespace: number,
  year: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespace}, ${year})`;
}

function extractSequence(referenceNumber: string): number {
  const maybeSeq = referenceNumber.split('-').at(-1);
  if (!maybeSeq) return 0;

  const parsed = Number.parseInt(maybeSeq, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatReference(prefix: 'WO' | 'PR', year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(SEQUENCE_PAD, '0')}`;
}

async function findLatestReference(
  tx: Prisma.TransactionClient,
  model: 'workOrder' | 'problemReport',
  prefix: 'WO' | 'PR',
  year: number,
): Promise<string | null> {
  const startsWith = `${prefix}-${year}-`;

  if (model === 'workOrder') {
    const latest = await tx.workOrder.findFirst({
      where: { referenceNumber: { startsWith } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    });
    return latest?.referenceNumber ?? null;
  }

  const latest = await tx.problemReport.findFirst({
    where: { referenceNumber: { startsWith } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  return latest?.referenceNumber ?? null;
}

export async function nextWorkOrderReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  await acquireSequenceLock(tx, WO_LOCK_NAMESPACE, year);

  const latest = await findLatestReference(tx, 'workOrder', 'WO', year);
  const nextSequence = extractSequence(latest ?? '') + 1;
  return formatReference('WO', year, nextSequence);
}

export async function nextProblemReportReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  await acquireSequenceLock(tx, PR_LOCK_NAMESPACE, year);

  const latest = await findLatestReference(tx, 'problemReport', 'PR', year);
  const nextSequence = extractSequence(latest ?? '') + 1;
  return formatReference('PR', year, nextSequence);
}
