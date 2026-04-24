import { buildResendSetupSchema, extractApiErrorMessage } from './resend-setup-utils';

describe('buildResendSetupSchema', () => {
  it('requires a non-empty email', () => {
    const schema = buildResendSetupSchema('required', 'invalid');

    const result = schema.safeParse({ email: '' });

    expect(result.success).toBe(false);
  });

  it('rejects invalid email formats', () => {
    const schema = buildResendSetupSchema('required', 'invalid');

    const result = schema.safeParse({ email: 'not-an-email' });

    expect(result.success).toBe(false);
  });

  it('accepts a valid email', () => {
    const schema = buildResendSetupSchema('required', 'invalid');

    const result = schema.safeParse({ email: 'user@gmao.local' });

    expect(result.success).toBe(true);
  });
});

describe('extractApiErrorMessage', () => {
  it('returns the first string message from array responses', () => {
    const message = extractApiErrorMessage(
      { response: { data: { message: ['first', 'second'] } } },
      'fallback',
    );

    expect(message).toBe('first');
  });

  it('falls back when no response message is present', () => {
    expect(extractApiErrorMessage({}, 'fallback')).toBe('fallback');
  });
});