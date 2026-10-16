#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a3180f53a847b46b7d441ce76d4baa0f30621e202f30904d1f58b06e1e4b2e67/contract';
import endContract from '../../snapshots/a3180f53a847b46b7d441ce76d4baa0f30621e202f30904d1f58b06e1e4b2e67/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations(): Migration<never, End>['operations'] {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'client_allowed_origins',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('origin', 'character varying(512)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
        ],
        constraints: [primaryKey(['client_id', 'origin'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'clients',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('clients_status_check_56c81764', sql`"status" IN ('ACTIVE', 'DISABLED')`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'refresh_sessions',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expires_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('revoked_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('token_hash', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_agent', 'character varying(512)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 512 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'roles',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'user_roles',
        columns: [
          col('assigned_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('role_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['user_id', 'role_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'character varying(320)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 320 } },
          }),
          col('email_verified_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('password_hash', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('users_status_check_56c81764', sql`"status" IN ('ACTIVE', 'DISABLED')`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'refresh_sessions',
        constraint: 'refresh_sessions_token_hash_key',
        columns: ['token_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'roles',
        constraint: 'roles_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_client_id_email_key',
        columns: ['client_id', 'email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'client_allowed_origins',
        index: 'client_allowed_origins_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_sessions',
        index: 'refresh_sessions_expires_at_idx_35365ada',
        columns: ['expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_sessions',
        index: 'refresh_sessions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_sessions',
        index: 'refresh_sessions_user_id_revoked_at_idx_4c62e965',
        columns: ['user_id', 'revoked_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_roles',
        index: 'user_roles_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_roles',
        index: 'user_roles_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'client_allowed_origins',
        foreignKey: {
          name: 'client_allowed_origins_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'refresh_sessions',
        foreignKey: {
          name: 'refresh_sessions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_roles',
        foreignKey: {
          name: 'user_roles_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_roles',
        foreignKey: {
          name: 'user_roles_role_id_fkey',
          columns: ['role_id'],
          references: { schema: 'public', table: 'roles', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'users',
        foreignKey: {
          name: 'users_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
