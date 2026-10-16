import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto.js';

describe('RegisterDto', () => {
  it('accepts a valid email and password', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'person@example.com',
      password: 'long-enough password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { email: 'not-an-email', password: 'long-enough password' },
    { email: 'person@example.com', password: 'short' },
    { email: 'person@example.com', password: 'x'.repeat(129) },
  ])('rejects invalid registration input: %p', async (input) => {
    const dto = plainToInstance(RegisterDto, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
