import 'reflect-metadata';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  it('hashes passwords using Argon2id with the configured cost', async () => {
    const password = 'correct horse battery staple';
    const hash = await passwordService.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it('verifies a matching password', async () => {
    const password = 'correct horse battery staple';
    const hash = await passwordService.hash(password);

    await expect(passwordService.verify(password, hash)).resolves.toBe(true);
  });

  it('rejects a password that does not match the hash', async () => {
    const hash = await passwordService.hash('correct horse battery staple');

    await expect(
      passwordService.verify('incorrect password', hash),
    ).resolves.toBe(false);
  });
});
