import 'reflect-metadata';
import {
  parsePlatformAdminRevocationArgs,
  revokePlatformAdminAssignment,
  type PlatformAdminRevocationTransaction,
} from './platform-admin-revocation.js';

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

  describe('revokePlatformAdminAssignment', () => {
    const target = {
      clientId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
    };
    const user = { id: 'target-user' };
    const role = { id: 'platform-admin-role' };

    let findUser: jest.Mock;
    let findRole: jest.Mock;
    let deleteAssignments: jest.Mock;
    let transaction: PlatformAdminRevocationTransaction;

    beforeEach(() => {
      findUser = jest.fn().mockResolvedValue(user);
      findRole = jest.fn().mockResolvedValue(role);
      deleteAssignments = jest.fn().mockResolvedValue({ count: 1 });
      transaction = {
        user: { findFirst: findUser },
        role: { findUnique: findRole },
        userRole: { deleteMany: deleteAssignments },
      } as unknown as PlatformAdminRevocationTransaction;
    });

    it('deletes only the targeted platform_admin assignment', async () => {
      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(true);

      expect(findUser).toHaveBeenCalledWith({
        where: { clientId: target.clientId, email: target.email },
        select: { id: true },
      });
      expect(findRole).toHaveBeenCalledWith({
        where: { name: 'platform_admin' },
        select: { id: true },
      });
      expect(deleteAssignments).toHaveBeenCalledWith({
        where: { userId: user.id, roleId: role.id },
      });
      expect(deleteAssignments).toHaveBeenCalledTimes(1);
    });

    it('fails explicitly when the account is missing without deleting an assignment', async () => {
      findUser.mockResolvedValue(null);

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).rejects.toThrow(
        `No account "${target.email}" was found for client "${target.clientId}".`,
      );
      expect(findRole).not.toHaveBeenCalled();
      expect(deleteAssignments).not.toHaveBeenCalled();
    });

    it('returns false without deleting when the role is missing', async () => {
      findRole.mockResolvedValue(null);

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(false);
      expect(deleteAssignments).not.toHaveBeenCalled();
    });

    it('returns false without deleting when the targeted assignment is missing', async () => {
      deleteAssignments.mockResolvedValue({ count: 0 });

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(false);
      expect(deleteAssignments).toHaveBeenCalledWith({
        where: { userId: user.id, roleId: role.id },
      });
    });
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
