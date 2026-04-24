import { middleware } from './middleware';

function createRequest(pathname: string, rolesCookie?: string) {
  return {
    nextUrl: new URL(`http://localhost${pathname}`),
    cookies: {
      get: jest.fn().mockReturnValue(rolesCookie ? { value: rolesCookie } : undefined),
    },
  } as never;
}

describe('middleware public auth paths', () => {
  it('allows /resend-setup without auth cookies', () => {
    const response = middleware(createRequest('/resend-setup'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('allows /auth/resend-setup without auth cookies', () => {
    const response = middleware(createRequest('/auth/resend-setup'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});