import { buildAnalyticsExportFileName, exportAnalyticsPdf } from './supervisor-analytics-board';
import { workOrdersApi } from '@/lib/work-orders.api';

jest.mock('@/lib/work-orders.api', () => ({
  workOrdersApi: {
    exportAnalyticsPdf: jest.fn(),
  },
}));

describe('Supervisor analytics PDF export helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildAnalyticsExportFileName returns deterministic file name', () => {
    const result = buildAnalyticsExportFileName(30, new Date('2026-05-05T12:00:00.000Z'));
    expect(result).toBe('supervisor-analytics-30d-2026-05-05.pdf');
  });

  it('exportAnalyticsPdf downloads returned blob with expected filename', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    (workOrdersApi.exportAnalyticsPdf as jest.Mock).mockResolvedValue(blob);

    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const createObjectURL = jest.fn().mockReturnValue('blob:pdf-url');
    const revokeObjectURL = jest.fn();

    const previousWindow = (global as any).window;
    const previousDocument = (global as any).document;

    (global as any).window = {
      URL: { createObjectURL, revokeObjectURL },
    };
    (global as any).document = {
      createElement: jest.fn().mockReturnValue({
        click,
        href: '',
        download: '',
      }),
      body: {
        appendChild,
        removeChild,
      },
    };

    await exportAnalyticsPdf({ periodDays: 14 }, new Date('2026-05-05T12:00:00.000Z'));

    expect(workOrdersApi.exportAnalyticsPdf).toHaveBeenCalledWith({ periodDays: 14 });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf-url');

    (global as any).window = previousWindow;
    (global as any).document = previousDocument;
  });

  it('exportAnalyticsPdf propagates API errors', async () => {
    (workOrdersApi.exportAnalyticsPdf as jest.Mock).mockRejectedValue(new Error('download failed'));

    await expect(exportAnalyticsPdf({ periodDays: 7 })).rejects.toThrow('download failed');
  });
});
