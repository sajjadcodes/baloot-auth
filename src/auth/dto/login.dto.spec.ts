import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';

describe('LoginDto', () => {
  it('accepts a valid email and password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'person@example.com',
      password: 'a valid long password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { email: 'not-an-email', password: 'a valid long password' },
    { email: 'person@example.com', password: 'short' },
    { email: 'person@example.com', password: 'x'.repeat(129) },
  ])('rejects invalid login input: %p', async (input) => {
    const dto = plainToInstance(LoginDto, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
