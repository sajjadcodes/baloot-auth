import 'reflect-metadata';
import type { Response } from 'express';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('sets browser cookies and returns only public user information', async () => {
    const result = {
      user: { id: 'user-1', email: 'person@example.com' },
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    };
    const register = jest.fn().mockResolvedValue(result);
    const auth = {
      register,
    } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const response = {} as Response;
    const dto = {
      email: result.user.email,
      password: 'long registration password',
    };

    await expect(controller.register(dto, response)).resolves.toEqual(
      result.user,
    );
    expect(register).toHaveBeenCalledWith(dto.email, dto.password);
    expect(setAuthenticationCookies).toHaveBeenCalledWith(
      response,
      result.accessToken,
      result.refreshToken,
    );
  });

  it('does not set cookies when registration fails', async () => {
    const register = jest
      .fn()
      .mockRejectedValue(new Error('registration failed'));
    const auth = {
      register,
    } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);

    await expect(
      controller.register(
        { email: 'person@example.com', password: 'long registration password' },
        {} as Response,
      ),
    ).rejects.toThrow('registration failed');
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });
});
