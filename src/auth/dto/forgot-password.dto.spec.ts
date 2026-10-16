import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto.js';

describe('ForgotPasswordDto', () => {
  it('accepts a valid email address', async () => {
    const dto = plainToInstance(ForgotPasswordDto, {
      email: 'person@example.com',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([{ email: 'not-an-email' }, { email: 'x'.repeat(321) }])(
    'rejects invalid email input: %p',
    async (input) => {
      const dto = plainToInstance(ForgotPasswordDto, input);

      await expect(validate(dto)).resolves.not.toHaveLength(0);
    },
  );
});
