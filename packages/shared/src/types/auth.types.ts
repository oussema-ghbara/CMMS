import type { Role } from '../enums/role.enum';

export interface AuthResponse {
  accessToken: string;
  roles: Role[];
  userId: string;
  name: string;
}

export interface UserSession {
  id: string;
  name: string;
  roles: Role[];
}
