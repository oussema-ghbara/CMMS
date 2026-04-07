import type { Role } from '../enums/role.enum';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  isActive: boolean;
  hourlyRate: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  roles: Role[];
  hourlyRate?: number;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  roles?: Role[];
  hourlyRate?: number | null;
}
