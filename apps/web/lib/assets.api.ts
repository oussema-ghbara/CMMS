import { api } from './api';
import type { AssetStatus } from '@gmao/shared';

export interface AssetListItem {
  id: string;
  name: string;
  status: AssetStatus;
  qrCodeIdentifier: string;
  category: {
    id: string;
    name: string;
  };
  location: {
    id: string;
    name: string;
    fullPath: string;
  };
  parent: {
    id: string;
    name: string;
  } | null;
}

export interface AssetListResponse {
  data: AssetListItem[];
  total: number;
}

export interface AssetListQuery {
  search?: string;
  status?: AssetStatus;
  page?: number;
  limit?: number;
}

export const assetsApi = {
  list: (params?: AssetListQuery) =>
    api.get<AssetListResponse>('/assets', { params }).then((response) => response.data),
};