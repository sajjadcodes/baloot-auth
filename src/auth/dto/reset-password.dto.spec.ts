import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto.js';

describe('ResetPasswordDto', () => {
  it('accepts a reset token and valid new password', async () => {
    const dto = plainToInstance(ResetPasswordDto, {
      token: 'signed-reset-token',
      password: 'a new valid password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { token: '', password: 'a new valid password' },
    { token: 'token', password: 'short' },
    { token: 'token', password: 'x'.repeat(129) },
    { token: 'x'.repeat(4097), password: 'a new valid password' },
  ])('rejects invalid reset input: %p', async (input) => {
    const dto = plainToInstance(ResetPasswordDto, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
