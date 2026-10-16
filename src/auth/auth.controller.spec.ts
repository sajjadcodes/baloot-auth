import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from './auth.constants.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';

describe('AuthController', () => {
  it('requires trusted-origin validation on every state-changing auth route', () => {
    for (const method of ['register', 'login', 'refresh', 'logout'] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype[method],
      );

      expect(guards).toContain(TrustedOriginGuard);
    }
  });

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

  it('returns the authenticated user for the matching client', async () => {
    const currentUser = { id: 'user-1', email: 'person@example.com' };
    const getCurrentUser = jest.fn().mockResolvedValue(currentUser);
    const auth = { getCurrentUser } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.getCurrentUser(
        { user: { userId: currentUser.id, clientId } } as Request & {
          user: { userId: string; clientId: string };
        },
        clientId,
      ),
    ).resolves.toEqual(currentUser);
    expect(getCurrentUser).toHaveBeenCalledWith(currentUser.id, clientId);
  });

  it('rejects a current-user request when the client differs from the token', async () => {
    const getCurrentUser = jest.fn();
    const auth = { getCurrentUser } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);

    await expect(
      controller.getCurrentUser(
        {
          user: {
            userId: 'user-1',
            clientId: '00000000-0000-4000-8000-000000000001',
          },
        } as Request & { user: { userId: string; clientId: string } },
        '00000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toThrow('Invalid or expired access token.');
    expect(getCurrentUser).not.toHaveBeenCalled();
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
        } as unknown as Request,
        'client-id',
        {} as Response,
      ),
    ).rejects.toThrow('rotation failed');
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });

  it('revokes the refresh session and clears cookies on logout', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    const auth = { logout } as unknown as AuthService;
    const clearAuthenticationCookies = jest.fn();
    const cookies = {
      clearAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const request = {
      cookies: { [REFRESH_TOKEN_COOKIE]: 'refresh-secret' },
    } as unknown as Request;
    const response = {} as Response;
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.logout(request, clientId, response),
    ).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledWith('refresh-secret', clientId);
    expect(clearAuthenticationCookies).toHaveBeenCalledWith(response);
  });

  it('still clears cookies when logout has no refresh cookie', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    const auth = { logout } as unknown as AuthService;
    const clearAuthenticationCookies = jest.fn();
    const cookies = {
      clearAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const response = {} as Response;

    await controller.logout({ cookies: {} } as Request, 'client-id', response);

    expect(logout).toHaveBeenCalledWith(undefined, 'client-id');
    expect(clearAuthenticationCookies).toHaveBeenCalledWith(response);
  });

  it('does not clear cookies when logout fails unexpectedly', async () => {
    const logout = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    const auth = { logout } as unknown as AuthService;
    const clearAuthenticationCookies = jest.fn();
    const cookies = {
      clearAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);

    await expect(
      controller.logout(
        { cookies: {} } as Request,
        'client-id',
        {} as Response,
      ),
    ).rejects.toThrow('database unavailable');
    expect(clearAuthenticationCookies).not.toHaveBeenCalled();
  });
});
