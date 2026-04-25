/**
 * §9.1 — ReportDetailItem enrichment: active WOs, cert alerts, intervention history.
 *
 * These tests verify the frontend type contract (shape of the data) and that the
 * reportsApi.getOne call returns and passes through the enriched fields. No component
 * rendering tests are included here because the reports-board is too large to mount
 * in isolation; the repository spec (reports.repository.spec.ts) covers the data layer.
 */
import { reportsApi, type ReportDetailItem } from './reports.api';
import { api } from './api';
import { WorkOrderStatus } from '@gmao/shared';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
  },
}));

function buildDetailPayload(overrides: Partial<ReportDetailItem> = {}): ReportDetailItem {
  return {
    id: 'report-1',
    referenceNumber: 'REP-001',
    assetId: 'asset-1',
    reporterId: 'user-1',
    description: 'Machine stopped',
    urgencyPerception: 'MACHINE_STOPPED' as never,
    status: 'PENDING' as never,
    processedById: null,
    processedAt: null,
    rejectionReason: null,
    rejectionDetail: null,
    deferredAt: null,
    deferNote: null,
    archiveReason: null,
    replacedByWorkOrderRef: null,
    createdAt: '2026-04-20T08:00:00Z',
    updatedAt: '2026-04-20T08:00:00Z',
    reporter: { id: 'user-1', name: 'Alice' },
    processedBy: null,
    asset: {
      id: 'asset-1',
      name: 'Press 01',
      location: { fullPath: 'Hall A / Press 01' },
      workOrders: [
        {
          id: 'wo-1',
          referenceNumber: 'WO-001',
          status: WorkOrderStatus.IN_PROGRESS,
          type: 'CORRECTIVE',
          description: 'Ongoing repair',
          createdAt: '2026-04-19T09:00:00Z',
        },
      ],
      certificates: [
        {
          id: 'cert-1',
          certificateType: 'ELECTRICAL',
          otherType: null,
          status: 'EXPIRING_SOON',
          expirationDate: '2026-05-01T00:00:00Z',
          issuingAuthority: 'Bureau Veritas',
        },
      ],
    },
    comments: [],
    derivedWorkOrders: [],
    assetInterventionHistory: [
      {
        id: 'wo-closed-1',
        referenceNumber: 'WO-000',
        type: 'CORRECTIVE',
        closedAt: '2026-04-10T14:00:00Z',
        description: 'Previous fix',
        principalTechnician: { id: 'tech-1', name: 'Bob' },
      },
    ],
    ...overrides,
  };
}

describe('reportsApi.getOne — §9.1 enrichment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns asset.workOrders for duplicate detection', async () => {
    const payload = buildDetailPayload();
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await reportsApi.getOne('report-1');

    expect(result.asset.workOrders).toHaveLength(1);
    expect(result.asset.workOrders[0].status).toBe(WorkOrderStatus.IN_PROGRESS);
    expect(result.asset.workOrders[0].referenceNumber).toBe('WO-001');
  });

  it('returns asset.certificates for cert alerts', async () => {
    const payload = buildDetailPayload();
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await reportsApi.getOne('report-1');

    expect(result.asset.certificates).toHaveLength(1);
    expect(result.asset.certificates[0].status).toBe('EXPIRING_SOON');
    expect(result.asset.certificates[0].issuingAuthority).toBe('Bureau Veritas');
  });

  it('returns assetInterventionHistory for the sidebar', async () => {
    const payload = buildDetailPayload();
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await reportsApi.getOne('report-1');

    expect(result.assetInterventionHistory).toHaveLength(1);
    expect(result.assetInterventionHistory[0].referenceNumber).toBe('WO-000');
    expect(result.assetInterventionHistory[0].principalTechnician?.name).toBe('Bob');
  });

  it('returns empty arrays when no active WOs or history exist', async () => {
    const payload = buildDetailPayload({
      asset: {
        id: 'asset-1',
        name: 'Press 01',
        location: { fullPath: 'Hall A' },
        workOrders: [],
        certificates: [],
      },
      assetInterventionHistory: [],
    });
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await reportsApi.getOne('report-1');

    expect(result.asset.workOrders).toEqual([]);
    expect(result.assetInterventionHistory).toEqual([]);
  });

  it('calls GET /reports/:id', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: buildDetailPayload() });

    await reportsApi.getOne('report-99');

    expect(api.get).toHaveBeenCalledWith('/reports/report-99');
  });
});
