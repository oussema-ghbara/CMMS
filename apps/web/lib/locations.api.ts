import { api } from './api';

export interface LocationItem {
  id: string;
  name: string;
  fullPath: string;
  level: number;
  code: string | null;
}

export const locationsApi = {
  list: () => api.get<LocationItem[]>('/locations').then((r) => r.data),
};
