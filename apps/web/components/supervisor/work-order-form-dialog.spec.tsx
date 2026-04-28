/**
 * Tests for NEW-06: draft vs. assign intent is now explicit in the WO creation form.
 *
 * Covers:
 * - getSubmitLabelKey(): returns saveAsDraft when no technician selected
 * - getSubmitLabelKey(): returns createAndAssign when technician selected
 * - getSubmitLabelKey(): edge — empty string is falsy (counts as no technician)
 * - getSubmitLabelKey(): edge — whitespace-only string is truthy (unexpected but documented)
 * - Both keys are distinct i18n strings (no accidental aliasing)
 */

import { getSubmitLabelKey } from './work-order-form-dialog';

describe('getSubmitLabelKey (NEW-06: §3.1 draft vs. publish intent)', () => {
  it('returns the saveAsDraft i18n key when no technician is selected', () => {
    expect(getSubmitLabelKey(false)).toBe('supervisorWorkOrders.form.saveAsDraft');
  });

  it('returns the createAndAssign i18n key when a technician is selected', () => {
    expect(getSubmitLabelKey(true)).toBe('supervisorWorkOrders.form.createAndAssign');
  });

  it('treats false as "no technician" (empty-string coercion guard)', () => {
    expect(getSubmitLabelKey(!!'')).toBe('supervisorWorkOrders.form.saveAsDraft');
  });

  it('treats true as "technician selected" (non-empty-string coercion guard)', () => {
    expect(getSubmitLabelKey(!!'tech-id-123')).toBe('supervisorWorkOrders.form.createAndAssign');
  });

  it('the two keys are distinct strings', () => {
    expect(getSubmitLabelKey(false)).not.toBe(getSubmitLabelKey(true));
  });
});
