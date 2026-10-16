import { lastValueFrom, of } from 'rxjs';
import { SuccessResponseInterceptor } from './success-response.interceptor.js';

describe('SuccessResponseInterceptor', () => {
  it('wraps endpoint data in the stable success envelope', async () => {
    const payload = { id: 'user-1', email: 'person@example.com' };
    const response = { statusCode: 201 };
    const context = {
      switchToHttp: () => ({ getResponse: () => response }),
    };
    const handler = { handle: () => of(payload) };
    const interceptor = new SuccessResponseInterceptor();

    await expect(
      lastValueFrom(interceptor.intercept(context as never, handler as never)),
    ).resolves.toEqual({
      success: true,
      code: 201,
      message: 'Successful request!',
      data: payload,
    });
  });
});
