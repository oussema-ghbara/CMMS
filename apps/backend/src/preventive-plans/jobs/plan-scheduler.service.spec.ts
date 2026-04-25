import { Test } from '@nestjs/testing';
import { PlanSchedulerService } from './plan-scheduler.service';
import { PreventivePlansRepository } from '../preventive-plans.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType, AssetStatus } from '@gmao/db';
import { PREVENTIVE_PLAN_QUEUE } from '../preventive-plans.constants';

describe('PlanSchedulerService - Conflict Detection (§9.6)', () => {
  let service: PlanSchedulerService;
  let repo: PreventivePlansRepository;
  let notifications: NotificationsService;
  let queue: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlanSchedulerService,
        {
          provide: PreventivePlansRepository,
          useValue: {
            findDuePlans: jest.fn(),
            findSameDayAssetConflicts: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifySupervisors: jest.fn(),
          },
        },
        {
          provide: getQueueToken(PREVENTIVE_PLAN_QUEUE),
          useValue: {
            addBulk: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PlanSchedulerService);
    repo = module.get(PreventivePlansRepository);
    notifications = module.get(NotificationsService);
    queue = module.get(getQueueToken(PREVENTIVE_PLAN_QUEUE));
  });

  describe('scheduleDuePlans()', () => {
    it('should skip when no plans are due', async () => {
      jest.spyOn(repo, 'findDuePlans').mockResolvedValue([]);

      await service.scheduleDuePlans();

      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
    });

    it('should enqueue plans without notifying when no conflicts exist', async () => {
      const plans = [
        {
          id: 'plan-1',
          assetId: 'asset-1',
          title: 'Plan A',
          asset: { id: 'asset-1', name: 'Asset A', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2',
          assetId: 'asset-2',
          title: 'Plan B',
          asset: { id: 'asset-2', name: 'Asset B', qrCodeIdentifier: 'QR-2', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      jest.spyOn(repo, 'findDuePlans').mockResolvedValue(plans);
      jest.spyOn(repo, 'findSameDayAssetConflicts').mockResolvedValue(new Map());

      await service.scheduleDuePlans();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
      expect(queue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'generate-plan-wo', data: { planId: 'plan-1' } }),
          expect.objectContaining({ name: 'generate-plan-wo', data: { planId: 'plan-2' } }),
        ]),
      );
    });

    it('should notify supervisors when a conflict is detected (2 plans for same asset)', async () => {
      const plans = [
        {
          id: 'plan-1',
          assetId: 'asset-1',
          title: 'Monthly Service',
          asset: { id: 'asset-1', name: 'Pump A', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2',
          assetId: 'asset-1',
          title: 'Quarterly Calibration',
          asset: { id: 'asset-1', name: 'Pump A', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = new Map([
        [
          'asset-1',
          [
            { planId: 'plan-1', planTitle: 'Monthly Service', assetName: 'Pump A' },
            { planId: 'plan-2', planTitle: 'Quarterly Calibration', assetName: 'Pump A' },
          ],
        ],
      ]);

      jest.spyOn(repo, 'findDuePlans').mockResolvedValue(plans);
      jest.spyOn(repo, 'findSameDayAssetConflicts').mockResolvedValue(conflicts);

      await service.scheduleDuePlans();

      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('Pump A'),
        'Asset',
        'asset-1',
      );
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('"Monthly Service"'),
        'Asset',
        'asset-1',
      );
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('"Quarterly Calibration"'),
        'Asset',
        'asset-1',
      );
    });

    it('should notify supervisors for each conflicting asset independently', async () => {
      const plans = [
        {
          id: 'plan-1a',
          assetId: 'asset-1',
          title: 'Plan 1A',
          asset: { id: 'asset-1', name: 'Asset 1', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-1b',
          assetId: 'asset-1',
          title: 'Plan 1B',
          asset: { id: 'asset-1', name: 'Asset 1', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2a',
          assetId: 'asset-2',
          title: 'Plan 2A',
          asset: { id: 'asset-2', name: 'Asset 2', qrCodeIdentifier: 'QR-2', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2b',
          assetId: 'asset-2',
          title: 'Plan 2B',
          asset: { id: 'asset-2', name: 'Asset 2', qrCodeIdentifier: 'QR-2', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = new Map([
        [
          'asset-1',
          [
            { planId: 'plan-1a', planTitle: 'Plan 1A', assetName: 'Asset 1' },
            { planId: 'plan-1b', planTitle: 'Plan 1B', assetName: 'Asset 1' },
          ],
        ],
        [
          'asset-2',
          [
            { planId: 'plan-2a', planTitle: 'Plan 2A', assetName: 'Asset 2' },
            { planId: 'plan-2b', planTitle: 'Plan 2B', assetName: 'Asset 2' },
          ],
        ],
      ]);

      jest.spyOn(repo, 'findDuePlans').mockResolvedValue(plans);
      jest.spyOn(repo, 'findSameDayAssetConflicts').mockResolvedValue(conflicts);

      await service.scheduleDuePlans();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(2);
      expect(notifications.notifySupervisors).toHaveBeenNthCalledWith(
        1,
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('Asset 1'),
        'Asset',
        'asset-1',
      );
      expect(notifications.notifySupervisors).toHaveBeenNthCalledWith(
        2,
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('Asset 2'),
        'Asset',
        'asset-2',
      );
    });

    it('should still enqueue ALL plans even when conflicts are detected', async () => {
      const plans = [
        {
          id: 'plan-1',
          assetId: 'asset-1',
          title: 'Plan 1',
          asset: { id: 'asset-1', name: 'Asset 1', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2',
          assetId: 'asset-1',
          title: 'Plan 2',
          asset: { id: 'asset-1', name: 'Asset 1', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = new Map([
        [
          'asset-1',
          [
            { planId: 'plan-1', planTitle: 'Plan 1', assetName: 'Asset 1' },
            { planId: 'plan-2', planTitle: 'Plan 2', assetName: 'Asset 1' },
          ],
        ],
      ]);

      jest.spyOn(repo, 'findDuePlans').mockResolvedValue(plans);
      jest.spyOn(repo, 'findSameDayAssetConflicts').mockResolvedValue(conflicts);

      await service.scheduleDuePlans();

      expect(queue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ data: { planId: 'plan-1' } }),
          expect.objectContaining({ data: { planId: 'plan-2' } }),
        ]),
      );
      expect(queue.addBulk).toHaveBeenCalledWith(expect.arrayContaining([expect.anything(), expect.anything()]));
      const callArgs = (queue.addBulk as jest.Mock).mock.calls[0][0];
      expect(callArgs).toHaveLength(2);
    });

    it('should include plan count in conflict notification message', async () => {
      const plans = [
        {
          id: 'p1',
          assetId: 'a1',
          title: 'T1',
          asset: { id: 'a1', name: 'Asset', qrCodeIdentifier: 'QR', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'p2',
          assetId: 'a1',
          title: 'T2',
          asset: { id: 'a1', name: 'Asset', qrCodeIdentifier: 'QR', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'p3',
          assetId: 'a1',
          title: 'T3',
          asset: { id: 'a1', name: 'Asset', qrCodeIdentifier: 'QR', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = new Map([
        [
          'a1',
          [
            { planId: 'p1', planTitle: 'T1', assetName: 'Asset' },
            { planId: 'p2', planTitle: 'T2', assetName: 'Asset' },
            { planId: 'p3', planTitle: 'T3', assetName: 'Asset' },
          ],
        ],
      ]);

      jest.spyOn(repo, 'findDuePlans').mockResolvedValue(plans);
      jest.spyOn(repo, 'findSameDayAssetConflicts').mockResolvedValue(conflicts);

      await service.scheduleDuePlans();

      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Conflit détecté : plusieurs plans préventifs',
        expect.stringContaining('3 plans'),
        'Asset',
        'a1',
      );
    });
  });
});
