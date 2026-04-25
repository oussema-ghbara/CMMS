import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PreventivePlansRepository } from './preventive-plans.repository';
import { PrismaService } from '../prisma/prisma.service';
import { PreventiveFrequencyType, AssetStatus } from '@gmao/db';

describe('PreventivePlansRepository - Conflict Detection (§9.6)', () => {
  let repo: PreventivePlansRepository;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PreventivePlansRepository,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    repo = module.get(PreventivePlansRepository);
    prisma = module.get(PrismaService);
  });

  describe('findSameDayAssetConflicts()', () => {
    it('should return empty map when no conflicts exist (all plans for different assets)', async () => {
      const duePlans = [
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

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);

      expect(conflicts.size).toBe(0);
    });

    it('should detect conflict when two plans are due for the same asset', async () => {
      const duePlans = [
        {
          id: 'plan-1',
          assetId: 'asset-1',
          title: 'Monthly Inspection',
          asset: { id: 'asset-1', name: 'Pump A', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2',
          assetId: 'asset-1',
          title: 'Quarterly Calibration',
          asset: { id: 'asset-1', name: 'Pump A', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);

      expect(conflicts.size).toBe(1);
      expect(conflicts.has('asset-1')).toBe(true);
      expect(conflicts.get('asset-1')).toEqual([
        { planId: 'plan-1', planTitle: 'Monthly Inspection', assetName: 'Pump A' },
        { planId: 'plan-2', planTitle: 'Quarterly Calibration', assetName: 'Pump A' },
      ]);
    });

    it('should detect conflict when three or more plans are due for the same asset', async () => {
      const duePlans = [
        {
          id: 'plan-1',
          assetId: 'asset-1',
          title: 'Plan 1',
          asset: { id: 'asset-1', name: 'Motor X', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-2',
          assetId: 'asset-1',
          title: 'Plan 2',
          asset: { id: 'asset-1', name: 'Motor X', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'plan-3',
          assetId: 'asset-1',
          title: 'Plan 3',
          asset: { id: 'asset-1', name: 'Motor X', qrCodeIdentifier: 'QR-1', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);

      expect(conflicts.size).toBe(1);
      expect(conflicts.get('asset-1')).toHaveLength(3);
    });

    it('should detect multiple independent conflicts (different assets with multiple plans each)', async () => {
      const duePlans = [
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
        {
          id: 'plan-3',
          assetId: 'asset-3',
          title: 'Plan 3 (no conflict)',
          asset: { id: 'asset-3', name: 'Asset 3', qrCodeIdentifier: 'QR-3', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);

      expect(conflicts.size).toBe(2);
      expect(conflicts.has('asset-1')).toBe(true);
      expect(conflicts.has('asset-2')).toBe(true);
      expect(conflicts.has('asset-3')).toBe(false);
      expect(conflicts.get('asset-1')).toHaveLength(2);
      expect(conflicts.get('asset-2')).toHaveLength(2);
    });

    it('should handle empty plans array', async () => {
      const duePlans = [] as any;

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);

      expect(conflicts.size).toBe(0);
    });

    it('should preserve plan details correctly (planId, planTitle, assetName)', async () => {
      const duePlans = [
        {
          id: 'unique-plan-id-1',
          assetId: 'shared-asset',
          title: 'Corrective Overhaul',
          asset: { id: 'shared-asset', name: 'Industrial Compressor', qrCodeIdentifier: 'QR-100', status: AssetStatus.OPERATIONAL },
        },
        {
          id: 'unique-plan-id-2',
          assetId: 'shared-asset',
          title: 'Preventive Lubrication',
          asset: { id: 'shared-asset', name: 'Industrial Compressor', qrCodeIdentifier: 'QR-100', status: AssetStatus.OPERATIONAL },
        },
      ] as any;

      const conflicts = await repo.findSameDayAssetConflicts(duePlans);
      const conflict = conflicts.get('shared-asset');

      expect(conflict).toContainEqual({
        planId: 'unique-plan-id-1',
        planTitle: 'Corrective Overhaul',
        assetName: 'Industrial Compressor',
      });
      expect(conflict).toContainEqual({
        planId: 'unique-plan-id-2',
        planTitle: 'Preventive Lubrication',
        assetName: 'Industrial Compressor',
      });
    });
  });
});
