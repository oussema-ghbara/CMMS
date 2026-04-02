import { Role } from '@gmao/shared';

export interface AccessTokenPayload {
  sub: string;    // userId
  email: string;
  roles: Role[];
}

export interface RefreshTokenPayload {
  sub: string;    // userId
  jti: string;    // UUID — keyed in Redis for revocation
}
