import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { Role } from '@gmao/shared';
import { ROLES_KEY } from './roles.decorator';
import { OPERATIONAL_ROLES } from './operational-roles.decorator';
import { AssetsController } from '../../assets/assets.controller';
import { WorkOrdersController } from '../../work-orders/work-orders.controller';
import { PreventivePlansController } from '../../preventive-plans/preventive-plans.controller';
import { ReportsController } from '../../reports/reports.controller';
import { PartRequestsController } from '../../inventory/part-requests.controller';
import { PartsController } from '../../inventory/parts.controller';

const getClassRoles = (target: Function) =>
  Reflect.getMetadata(ROLES_KEY, target) as Role[] | undefined;

const getMethodRoles = (target: Function, methodName: string) =>
  Reflect.getMetadata(ROLES_KEY, target.prototype[methodName]) as Role[] | undefined;

describe('Operational role policy metadata', () => {
  it('applies operational roles at class level on operational controllers', () => {
    const expected = [...OPERATIONAL_ROLES];

    expect(getClassRoles(AssetsController)).toEqual(expected);
    expect(getClassRoles(WorkOrdersController)).toEqual(expected);
    expect(getClassRoles(PreventivePlansController)).toEqual(expected);
    expect(getClassRoles(ReportsController)).toEqual(expected);
    expect(getClassRoles(PartRequestsController)).toEqual(expected);
    expect(getClassRoles(PartsController)).toEqual(expected);
  });

  it('keeps method-level role overrides for restricted operations', () => {
    expect(getMethodRoles(ReportsController, 'submit')).toEqual([
      Role.REQUESTER,
      Role.TECHNICIAN,
    ]);
    expect(getMethodRoles(WorkOrdersController, 'create')).toEqual([
      Role.SUPERVISOR,
    ]);
    expect(getMethodRoles(PartRequestsController, 'findQueue')).toEqual([
      Role.STOREKEEPER,
    ]);
    expect(getMethodRoles(PartsController, 'create')).toEqual([
      Role.STOREKEEPER,
    ]);
  });

  it('uses class-level operational roles for read methods without explicit overrides', () => {
    expect(getMethodRoles(AssetsController, 'findAll')).toBeUndefined();
    expect(getMethodRoles(WorkOrdersController, 'findAll')).toBeUndefined();
    expect(getMethodRoles(ReportsController, 'findAll')).toBeUndefined();
    expect(getMethodRoles(PartsController, 'findAll')).toBeUndefined();
  });
});
