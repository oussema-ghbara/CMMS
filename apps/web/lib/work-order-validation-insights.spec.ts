import {
  getContributorWithoutLogNames,
  getTimeDeviationPresentation,
} from './work-order-validation-insights';

describe('work-order-validation-insights', () => {
  describe('getContributorWithoutLogNames', () => {
    it('joins contributor names with comma separator', () => {
      const names = getContributorWithoutLogNames([
        { name: 'Contributor A' },
        { name: 'Contributor B' },
      ]);

      expect(names).toBe('Contributor A, Contributor B');
    });

    it('returns empty string when there are no contributors', () => {
      expect(getContributorWithoutLogNames([])).toBe('');
    });
  });

  describe('getTimeDeviationPresentation', () => {
    it('returns neutral values when time deviation is missing', () => {
      expect(getTimeDeviationPresentation(undefined)).toEqual({
        absoluteDeviationMinutes: null,
        absoluteDeviationPercent: null,
        direction: 'none',
      });
    });

    it('computes absolute values and over direction for positive delta', () => {
      expect(
        getTimeDeviationPresentation({
          estimatedDurationMinutes: 120,
          actualDurationMinutes: 180,
          deltaMinutes: 60,
          deltaPercent: 50,
        }),
      ).toEqual({
        absoluteDeviationMinutes: 60,
        absoluteDeviationPercent: 50,
        direction: 'over',
      });
    });

    it('computes absolute values and under direction for negative delta', () => {
      expect(
        getTimeDeviationPresentation({
          estimatedDurationMinutes: 120,
          actualDurationMinutes: 90,
          deltaMinutes: -30,
          deltaPercent: -25,
        }),
      ).toEqual({
        absoluteDeviationMinutes: 30,
        absoluteDeviationPercent: 25,
        direction: 'under',
      });
    });

    it('marks equal direction when delta is zero', () => {
      expect(
        getTimeDeviationPresentation({
          estimatedDurationMinutes: 120,
          actualDurationMinutes: 120,
          deltaMinutes: 0,
          deltaPercent: 0,
        }),
      ).toEqual({
        absoluteDeviationMinutes: 0,
        absoluteDeviationPercent: 0,
        direction: 'equal',
      });
    });

    it('preserves null percent while still returning minute deviation', () => {
      expect(
        getTimeDeviationPresentation({
          estimatedDurationMinutes: 0,
          actualDurationMinutes: 30,
          deltaMinutes: 30,
          deltaPercent: null,
        }),
      ).toEqual({
        absoluteDeviationMinutes: 30,
        absoluteDeviationPercent: null,
        direction: 'over',
      });
    });
  });
});
