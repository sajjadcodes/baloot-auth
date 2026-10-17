#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8604162ec14ac5dd0d8105d54dc96d50454765b4e745a1bec093cfff8d5c171f/contract';
import endContract from '../../snapshots/8604162ec14ac5dd0d8105d54dc96d50454765b4e745a1bec093cfff8d5c171f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a3180f53a847b46b7d441ce76d4baa0f30621e202f30904d1f58b06e1e4b2e67/contract';
import startContract from '../../snapshots/a3180f53a847b46b7d441ce76d4baa0f30621e202f30904d1f58b06e1e4b2e67/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

    override get operations(): Migration<Start, End>['operations'] {
    return [
      this.createTable({
        schema: 'public',
        table: 'admin_audit_events',
        columns: [
          col('action', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('actor_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('session_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'auth_sessions',
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
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'refresh_sessions',
        column: 'session_id',
        type: 'uuid',
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_events',
        index: 'admin_audit_events_actor_user_id_idx_c46ca325',
        columns: ['actor_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_events',
        index: 'admin_audit_events_client_id_created_at_idx_379d2914',
        columns: ['client_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_events',
        index: 'admin_audit_events_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_events',
        index: 'admin_audit_events_target_user_id_created_at_idx_0b483981',
        columns: ['target_user_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_events',
        index: 'admin_audit_events_target_user_id_idx_cc615011',
        columns: ['target_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_sessions',
        index: 'auth_sessions_expires_at_idx_35365ada',
        columns: ['expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_sessions',
        index: 'auth_sessions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_sessions',
        index: 'auth_sessions_user_id_revoked_at_idx_4c62e965',
        columns: ['user_id', 'revoked_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_sessions',
        index: 'refresh_sessions_session_id_idx_00ba47bf',
        columns: ['session_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_sessions',
        index: 'refresh_sessions_session_id_revoked_at_idx_6413f9af',
        columns: ['session_id', 'revoked_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'admin_audit_events',
        foreignKey: {
          name: 'admin_audit_events_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'admin_audit_events',
        foreignKey: {
          name: 'admin_audit_events_actor_user_id_fkey',
          columns: ['actor_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'admin_audit_events',
        foreignKey: {
          name: 'admin_audit_events_target_user_id_fkey',
          columns: ['target_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auth_sessions',
        foreignKey: {
          name: 'auth_sessions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'refresh_sessions',
        foreignKey: {
          name: 'refresh_sessions_session_id_fkey',
          columns: ['session_id'],
          references: { schema: 'public', table: 'auth_sessions', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
