import { authApi } from './auth.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    post: jest.fn(),
  },
}));

describe('authApi.resendSetup', () => {
  it('posts the email to /auth/resend-setup', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: undefined });

    await authApi.resendSetup('new.user@gmao.local');

    expect(api.post).toHaveBeenCalledWith('/auth/resend-setup', {
      email: 'new.user@gmao.local',
    });
  });
});