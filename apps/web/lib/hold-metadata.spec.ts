import { AssetStatus, OnHoldReasonType } from '@gmao/shared';
import { buildHoldMetadataPayload, requiresHoldSupervisorAssetStatusChoice } from './hold-metadata';

describe('hold-metadata helpers', () => {
  it('requires a supervisor asset status choice only for OTHER holds', () => {
    expect(requiresHoldSupervisorAssetStatusChoice(OnHoldReasonType.OTHER)).toBe(true);
    expect(requiresHoldSupervisorAssetStatusChoice(OnHoldReasonType.MISSING_PART)).toBe(false);
    expect(requiresHoldSupervisorAssetStatusChoice(null)).toBe(false);
  });

  it('builds a payload that includes the supervisor asset status choice when provided', () => {
    expect(buildHoldMetadataPayload({
      expectedResolutionDate: '2026-05-01T10:00:00.000Z',
      retryDate: '',
      resolutionNote: '  review done  ',
      supervisorAssetStatusChoice: AssetStatus.OUT_OF_SERVICE,
    })).toEqual({
      expectedResolutionDate: '2026-05-01T10:00:00.000Z',
      resolutionNote: 'review done',
      supervisorAssetStatusChoice: AssetStatus.OUT_OF_SERVICE,
    });
  });
});