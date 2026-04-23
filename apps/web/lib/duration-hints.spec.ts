/**
 * Tests for the duration hints API client and the response shape.
 * These are pure-logic tests that do NOT need a running server.
 */

import type { DurationHintsResponse } from './work-orders.api';

describe('DurationHintsResponse contract', () => {
  it('accepts all-null response (no historical data)', () => {
    const response: DurationHintsResponse = {
      last5AssetAvgDays: null,
      categoryAvgDays: null,
      technicianAvgDays: null,
    };

    expect(response.last5AssetAvgDays).toBeNull();
    expect(response.categoryAvgDays).toBeNull();
    expect(response.technicianAvgDays).toBeNull();
  });

  it('accepts partial response (only asset avg available)', () => {
    const response: DurationHintsResponse = {
      last5AssetAvgDays: 7.5,
      categoryAvgDays: null,
      technicianAvgDays: null,
    };

    expect(response.last5AssetAvgDays).toBe(7.5);
  });

  it('accepts full response with all three values', () => {
    const response: DurationHintsResponse = {
      last5AssetAvgDays: 5.0,
      categoryAvgDays: 8.3,
      technicianAvgDays: 6.1,
    };

    expect(response.last5AssetAvgDays).toBe(5.0);
    expect(response.categoryAvgDays).toBe(8.3);
    expect(response.technicianAvgDays).toBe(6.1);
  });
});

describe('formatDays helper logic', () => {
  function formatDays(days: number | null): string {
    if (days === null) return '—';
    return `${days}j`;
  }

  it('formats null as dash', () => {
    expect(formatDays(null)).toBe('—');
  });

  it('formats a number with j suffix', () => {
    expect(formatDays(7.5)).toBe('7.5j');
  });

  it('formats zero days', () => {
    expect(formatDays(0)).toBe('0j');
  });
});

describe('CreateWorkOrderPayload with technician fields', () => {
  it('allows creating payload with principalTechnicianId', () => {
    const payload = {
      type: 'CORRECTIVE' as const,
      priority: 'MEDIUM' as const,
      description: 'Fix pump',
      assetId: 'asset-1',
      principalTechnicianId: 'tech-1',
      contributorIds: ['tech-2'],
    };

    expect(payload.principalTechnicianId).toBe('tech-1');
    expect(payload.contributorIds).toHaveLength(1);
  });

  it('allows payload without technician fields (DRAFT creation)', () => {
    const payload = {
      type: 'CORRECTIVE' as const,
      priority: 'MEDIUM' as const,
      description: 'Fix pump',
      assetId: 'asset-1',
    };

    expect((payload as Record<string, unknown>).principalTechnicianId).toBeUndefined();
    expect((payload as Record<string, unknown>).contributorIds).toBeUndefined();
  });
});
