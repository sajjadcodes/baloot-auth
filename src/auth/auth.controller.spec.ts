import 'reflect-metadata';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from './auth.constants.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  it('sets browser cookies and returns only public user information', async () => {
    const result = {
      user: { id: 'user-1', email: 'person@example.com' },
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    };
    const register = jest.fn().mockResolvedValue(result);
    const login = jest.fn().mockResolvedValue(result);
    const auth = {
      register,
      login,
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
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(controller.register(dto, clientId, response)).resolves.toEqual(
      result.user,
    );
    expect(register).toHaveBeenCalledWith(dto.email, dto.password, clientId);
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
        '00000000-0000-4000-8000-000000000001',
        {} as Response,
      ),
    ).rejects.toThrow('registration failed');
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });

  it('sets authentication cookies and returns public information after login', async () => {
    const result = {
      user: { id: 'user-1', email: 'person@example.com' },
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    };
    const login = jest.fn().mockResolvedValue(result);
    const auth = { login } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const dto = {
      email: result.user.email,
      password: 'long registration password',
    };
    const response = {} as Response;
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(controller.login(dto, clientId, response)).resolves.toEqual(
      result.user,
    );
    expect(login).toHaveBeenCalledWith(dto.email, dto.password, clientId);
    expect(setAuthenticationCookies).toHaveBeenCalledWith(
      response,
      result.accessToken,
      result.refreshToken,
    );
  });

  it('does not set cookies when login fails', async () => {
    const login = jest.fn().mockRejectedValue(new Error('login failed'));
    const auth = { login } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);

    await expect(
      controller.login(
        { email: 'person@example.com', password: 'long password value' },
        '00000000-0000-4000-8000-000000000001',
        {} as Response,
      ),
    ).rejects.toThrow('login failed');
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });

  it('rotates cookies using the refresh cookie and returns public information', async () => {
    const result = {
      user: { id: 'user-1', email: 'person@example.com' },
      accessToken: 'new-access-secret',
      refreshToken: 'new-refresh-secret',
    };
    const refresh = jest.fn().mockResolvedValue(result);
    const auth = { refresh } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const request = {
      cookies: { [REFRESH_TOKEN_COOKIE]: 'old-refresh-secret' },
    } as unknown as Request;
    const response = {} as Response;
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.refresh(request, clientId, response),
    ).resolves.toEqual(result.user);
    expect(refresh).toHaveBeenCalledWith('old-refresh-secret', clientId);
    expect(setAuthenticationCookies).toHaveBeenCalledWith(
      response,
      result.accessToken,
      result.refreshToken,
    );
  });

  it('rejects missing refresh cookies without setting authentication cookies', async () => {
    const refresh = jest.fn();
    const auth = { refresh } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);

    await expect(
      controller.refresh(
        { cookies: {} } as Request,
        'client-id',
        {} as Response,
      ),
    ).rejects.toThrow('Invalid or expired refresh token.');
    expect(refresh).not.toHaveBeenCalled();
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });

  it('does not set cookies when token rotation fails', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('rotation failed'));
    const auth = { refresh } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);

    await expect(
      controller.refresh(
        {
          cookies: { [REFRESH_TOKEN_COOKIE]: 'old-refresh-secret' },
        } as Request,
        'client-id',
        {} as Response,
      ),
    ).rejects.toThrow('rotation failed');
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });
});
