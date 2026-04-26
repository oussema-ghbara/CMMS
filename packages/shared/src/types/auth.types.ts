import type { Role } from '../enums/role.enum';

export interface AuthResponse {
  accessToken: string;
  roles: Role[];
  userId: string;
  name: string;
  /** Session idle timeout in hours, as configured by the admin (§3.4). */
  idleTimeoutHours: number;
}

export interface UserSession {
  id: string;
  name: string;
  roles: Role[];
}
