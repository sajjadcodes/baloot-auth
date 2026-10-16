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
    let findAssignment: jest.Mock;
    let deleteAssignment: jest.Mock;
    let whereUser: jest.Mock;
    let whereRole: jest.Mock;
    let whereAssignment: jest.Mock;
    let transaction: PlatformAdminRevocationTransaction;

    beforeEach(() => {
      findUser = jest.fn().mockResolvedValue(user);
      findRole = jest.fn().mockResolvedValue(role);
      findAssignment = jest.fn().mockResolvedValue({ userId: user.id });
      deleteAssignment = jest.fn().mockResolvedValue(undefined);
      whereUser = jest.fn(() => ({ first: findUser }));
      whereRole = jest.fn(() => ({ first: findRole }));
      whereAssignment = jest.fn(() => ({
        first: findAssignment,
        delete: deleteAssignment,
      }));
      transaction = {
        orm: {
          public: {
            User: { where: whereUser },
            Role: { where: whereRole },
            UserRole: { where: whereAssignment },
          },
        },
      } as unknown as PlatformAdminRevocationTransaction;
    });

    it('deletes only the targeted platform_admin assignment', async () => {
      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(true);

      expect(whereUser).toHaveBeenCalledWith({
        clientId: target.clientId,
        email: target.email,
      });
      expect(whereRole).toHaveBeenCalledWith({ name: 'platform_admin' });
      expect(whereAssignment).toHaveBeenNthCalledWith(1, {
        userId: user.id,
        roleId: role.id,
      });
      expect(whereAssignment).toHaveBeenNthCalledWith(2, {
        userId: user.id,
        roleId: role.id,
      });
      expect(deleteAssignment).toHaveBeenCalledTimes(1);
    });

    it('fails explicitly when the account is missing without deleting an assignment', async () => {
      findUser.mockResolvedValue(null);

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).rejects.toThrow(
        `No account "${target.email}" was found for client "${target.clientId}".`,
      );
      expect(whereRole).not.toHaveBeenCalled();
      expect(whereAssignment).not.toHaveBeenCalled();
      expect(deleteAssignment).not.toHaveBeenCalled();
    });

    it('returns false without deleting when the role is missing', async () => {
      findRole.mockResolvedValue(null);

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(false);
      expect(whereAssignment).not.toHaveBeenCalled();
      expect(deleteAssignment).not.toHaveBeenCalled();
    });

    it('returns false without deleting when the targeted assignment is missing', async () => {
      findAssignment.mockResolvedValue(null);

      await expect(
        revokePlatformAdminAssignment(transaction, target),
      ).resolves.toBe(false);
      expect(whereAssignment).toHaveBeenCalledWith({
        userId: user.id,
        roleId: role.id,
      });
      expect(deleteAssignment).not.toHaveBeenCalled();
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
