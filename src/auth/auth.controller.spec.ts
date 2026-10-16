import 'reflect-metadata';
import type { Response } from 'express';
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
});
