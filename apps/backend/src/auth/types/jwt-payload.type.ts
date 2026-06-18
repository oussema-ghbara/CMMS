import { Role } from '@gmao/shared';

export interface AccessTokenPayload {
  sub: string;    
  email: string;
  roles: Role[];
}

export interface RefreshTokenPayload {
  sub: string;    
  jti: string;    
}
