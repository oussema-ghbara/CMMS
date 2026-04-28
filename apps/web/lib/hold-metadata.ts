import { AssetStatus, OnHoldReasonType } from '@gmao/shared';
import type { UpdateHoldMetadataPayload } from './work-orders.api';

export interface HoldMetadataFormValues {
  expectedResolutionDate: string;
  retryDate: string;
  resolutionNote: string;
  supervisorAssetStatusChoice: AssetStatus | '';
}

export function requiresHoldSupervisorAssetStatusChoice(reasonType?: OnHoldReasonType | null): boolean {
  return reasonType === OnHoldReasonType.OTHER;
}

export function buildHoldMetadataPayload(values: HoldMetadataFormValues): UpdateHoldMetadataPayload {
  const payload: UpdateHoldMetadataPayload = {};

  if (values.expectedResolutionDate) payload.expectedResolutionDate = values.expectedResolutionDate;
  if (values.retryDate) payload.retryDate = values.retryDate;
  if (values.resolutionNote.trim()) payload.resolutionNote = values.resolutionNote.trim();
  if (values.supervisorAssetStatusChoice) {
    payload.supervisorAssetStatusChoice = values.supervisorAssetStatusChoice;
  }

  return payload;
}