import 'reflect-metadata';
import { parsePlatformAdminRevocationArgs } from './platform-admin-revocation.js';

describe('parsePlatformAdminRevocationArgs', () => {
  const clientId = '00000000-0000-4000-8000-000000000001';

  it('parses a confirmed target and normalizes the email', () => {
    expect(
      parsePlatformAdminRevocationArgs([
        '--client-id',
        clientId,
        '--email',
        ' Admin@Example.com ',
        '--confirm',
      ]),
    ).toEqual({ clientId, email: 'admin@example.com' });
  });

  it.each([
    [[], 'Usage:'],
    [
      ['--client-id', 'invalid', '--email', 'admin@example.com', '--confirm'],
      'UUID',
    ],
    [
      ['--client-id', clientId, '--email', 'invalid-email', '--confirm'],
      'valid email',
    ],
    [
      ['--client-id', clientId, '--email', 'admin@example.com'],
      'explicit confirmation',
    ],
    [
      [
        '--client-id',
        clientId,
        '--client-id',
        clientId,
        '--email',
        'admin@example.com',
        '--confirm',
      ],
      'must not be repeated',
    ],
    [
      [
        '--client-id',
        clientId,
        '--email',
        'admin@example.com',
        '--unknown',
        '--confirm',
      ],
      'Usage:',
    ],
  ])('rejects unsafe or incomplete arguments: %p', (args, message) => {
    expect(() => parsePlatformAdminRevocationArgs(args)).toThrow(message);
  });
});
