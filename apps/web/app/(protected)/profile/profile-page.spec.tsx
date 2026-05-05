import { formatDate, getChangePasswordErrorMessage } from './profile-utils';

describe('formatDate', () => {
  it('returns the fallback when value is null', () => {
    expect(formatDate(null, 'Jamais')).toBe('Jamais');
  });

  it('returns the fallback when value is undefined', () => {
    expect(formatDate(undefined, '—')).toBe('—');
  });

  it('formats a valid ISO date string in French locale format', () => {
    const result = formatDate('2026-01-15T08:30:00.000Z', '—');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('returns different fallbacks for different inputs', () => {
    expect(formatDate(null, 'Jamais')).toBe('Jamais');
    expect(formatDate(null, '—')).toBe('—');
  });
});

describe('getChangePasswordErrorMessage', () => {
  it('extracts a string message from an Axios error response', () => {
    const error = { response: { data: { message: 'auth.changePassword.incorrectCurrentPassword' } } };
    expect(getChangePasswordErrorMessage(error)).toBe('auth.changePassword.incorrectCurrentPassword');
  });

  it('extracts the first element from an array message', () => {
    const error = { response: { data: { message: ['validation.minLength', 'validation.other'] } } };
    expect(getChangePasswordErrorMessage(error)).toBe('validation.minLength');
  });

  it('returns an empty string when no response data is present', () => {
    expect(getChangePasswordErrorMessage({})).toBe('');
  });

  it('returns an empty string for null/undefined error', () => {
    expect(getChangePasswordErrorMessage(null)).toBe('');
    expect(getChangePasswordErrorMessage(undefined)).toBe('');
  });

  it('returns empty string when message array is empty', () => {
    const error = { response: { data: { message: [] } } };
    expect(getChangePasswordErrorMessage(error)).toBe('');
  });
});
