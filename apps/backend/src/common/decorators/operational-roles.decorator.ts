import { Role } from '@gmao/shared';
import { Roles } from './roles.decorator';

export const OPERATIONAL_ROLES = [
  Role.SUPERVISOR,
  Role.STOREKEEPER,
  Role.TECHNICIAN,
  Role.REQUESTER,
] as const;

export const OperationalRoles = (): MethodDecorator & ClassDecorator =>
  Roles(...OPERATIONAL_ROLES);
