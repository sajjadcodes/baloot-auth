import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from './auth.constants.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ROLES_KEY } from './decorators/roles.decorator.js';
import { AdminClientGuard } from './guards/admin-client.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';

describe('AuthController', () => {
  it('requires trusted-origin validation on every state-changing auth route', () => {
    for (const method of [
      'register',
      'verifyEmail',
      'resendVerification',
      'forgotPassword',
      'resetPassword',
      'login',
      'refresh',
      'logout',
      'disableAdminUser',
      'enableAdminUser',
      'revokeAdminUserSession',
    ] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype[method],
      );

      expect(guards).toContain(TrustedOriginGuard);
    }
  });

  it('requires authentication and a baseline role for the current-user route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.getCurrentUser,
    );
    const requiredRoles = Reflect.getMetadata(
      ROLES_KEY,
      AuthController.prototype.getCurrentUser,
    );

    expect(guards).toContain(RolesGuard);
    expect(requiredRoles).toEqual(['user', 'platform_admin']);
  });

  it('protects admin user lookup with the platform_admin role', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.getAdminUser,
    );
    const requiredRoles = Reflect.getMetadata(
      ROLES_KEY,
      AuthController.prototype.getAdminUser,
    );

    expect(guards).toContain(TrustedOriginGuard);
    expect(guards).toContain(AdminClientGuard);
    expect(guards).toContain(RolesGuard);
    expect(requiredRoles).toEqual(['platform_admin']);
  });

  it.each([
    'getAdminUserSessions',
    'disableAdminUser',
    'enableAdminUser',
    'revokeAdminUserSession',
  ] as const)(
    'protects %s with the complete same-client admin guard chain',
    (method) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype[method],
      );
      const requiredRoles = Reflect.getMetadata(
        ROLES_KEY,
        AuthController.prototype[method],
      );

      expect(guards).toEqual([
        ThrottlerGuard,
        TrustedOriginGuard,
        JwtAuthGuard,
        AdminClientGuard,
        RolesGuard,
      ]);
      expect(requiredRoles).toEqual(['platform_admin']);
    },
  );

  it('lists sessions using the authenticated admin client', async () => {
    const sessions = [
      {
        id: 'session-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-02-01T00:00:00.000Z',
      },
    ];
    const getClientUserSessions = jest.fn().mockResolvedValue(sessions);
    const controller = new AuthController(
      { getClientUserSessions } as unknown as AuthService,
      {} as AuthCookiesService,
    );

    await expect(
      controller.getAdminUserSessions('client-1', 'target-user'),
    ).resolves.toEqual(sessions);
    expect(getClientUserSessions).toHaveBeenCalledWith(
      'target-user',
      'client-1',
    );
  });

  it('passes the authenticated administrator to account and session mutations', async () => {
    const disableClientUser = jest.fn().mockResolvedValue(undefined);
    const enableClientUser = jest.fn().mockResolvedValue(undefined);
    const revokeClientUserSession = jest.fn().mockResolvedValue(undefined);
    const auth = {
      disableClientUser,
      enableClientUser,
      revokeClientUserSession,
    } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const request = {
      user: {
        userId: 'admin-user',
        clientId: 'client-1',
        sessionId: 'session-auth',
      },
    } as Request & {
      user: { userId: string; clientId: string; sessionId: string };
    };

    await controller.disableAdminUser(request, 'client-1', 'target-user');
    await controller.enableAdminUser(request, 'client-1', 'target-user');
    await controller.revokeAdminUserSession(
      request,
      'client-1',
      'target-user',
      'session-1',
    );

    expect(disableClientUser).toHaveBeenCalledWith(
      'admin-user',
      'target-user',
      'client-1',
    );
    expect(enableClientUser).toHaveBeenCalledWith(
      'admin-user',
      'target-user',
      'client-1',
    );
    expect(revokeClientUserSession).toHaveBeenCalledWith(
      'admin-user',
      'target-user',
      'client-1',
      'session-1',
    );
  });

  it('returns the requested account only for the matching client', async () => {
    const result = {
      id: 'target-user',
      email: 'person@example.com',
      status: 'ACTIVE',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2025-12-01T00:00:00.000Z',
      roles: ['user'],
    };
    const getClientUserForAdmin = jest.fn().mockResolvedValue(result);
    const controller = new AuthController(
      { getClientUserForAdmin } as unknown as AuthService,
      {} as AuthCookiesService,
    );
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(controller.getAdminUser(clientId, result.id)).resolves.toEqual(
      result,
    );
    expect(getClientUserForAdmin).toHaveBeenCalledWith(result.id, clientId);
  });

  it('requests password reset without revealing account eligibility', async () => {
    const requestPasswordReset = jest.fn().mockResolvedValue(undefined);
    const auth = { requestPasswordReset } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.forgotPassword({ email: 'person@example.com' }, clientId),
    ).resolves.toEqual({
      message: 'If the account is eligible, a password reset email was sent.',
    });
    expect(requestPasswordReset).toHaveBeenCalledWith(
      'person@example.com',
      clientId,
    );
  });

  it('resets the password using the submitted token and client', async () => {
    const resetPassword = jest.fn().mockResolvedValue(undefined);
    const auth = { resetPassword } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.resetPassword(
        { token: 'reset-token', password: 'new secure password' },
        clientId,
      ),
    ).resolves.toEqual({ message: 'Password reset successfully.' });
    expect(resetPassword).toHaveBeenCalledWith(
      'reset-token',
      'new secure password',
      clientId,
    );
  });

  it('sends verification after registration without setting authentication cookies', async () => {
    const user = { id: 'user-1', email: 'person@example.com' };
    const register = jest.fn().mockResolvedValue(user);
    const auth = {
      register,
    } as unknown as AuthService;
    const setAuthenticationCookies = jest.fn();
    const cookies = {
      setAuthenticationCookies,
    } as unknown as AuthCookiesService;
    const controller = new AuthController(auth, cookies);
    const dto = {
      email: user.email,
      password: 'long registration password',
    };
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(controller.register(dto, clientId)).resolves.toEqual(user);
    expect(register).toHaveBeenCalledWith(dto.email, dto.password, clientId);
    expect(setAuthenticationCookies).not.toHaveBeenCalled();
  });

  it('verifies an email using the token and request client', async () => {
    const verifyEmail = jest.fn().mockResolvedValue(undefined);
    const auth = { verifyEmail } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.verifyEmail({ token: 'verification-token' }, clientId),
    ).resolves.toEqual({ verified: true });
    expect(verifyEmail).toHaveBeenCalledWith('verification-token', clientId);
  });

  it('resends verification with a non-enumerating response', async () => {
    const resendVerificationEmail = jest.fn().mockResolvedValue(undefined);
    const auth = { resendVerificationEmail } as unknown as AuthService;
    const controller = new AuthController(auth, {} as AuthCookiesService);
    const clientId = '00000000-0000-4000-8000-000000000001';

    await expect(
      controller.resendVerification({ email: 'person@example.com' }, clientId),
    ).resolves.toEqual({
      message: 'If the account is eligible, a verification email was sent.',
    });
    expect(resendVerificationEmail).toHaveBeenCalledWith(
      'person@example.com',
      clientId,
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
        {
          user: {
            userId: currentUser.id,
            clientId,
            sessionId: 'session-1',
          },
        } as Request & {
          user: { userId: string; clientId: string; sessionId: string };
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
            sessionId: 'session-1',
          },
        } as Request & {
          user: { userId: string; clientId: string; sessionId: string };
        },
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
