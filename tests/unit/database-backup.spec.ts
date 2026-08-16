import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBackupManifest,
  createBackupPlan,
  isPathInside,
  resolveBackupConfig
} from '../../scripts/ops/backup-database.mjs';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('database backup operations', () => {
  it('rejects backup output inside the repository', () => {
    const cwd = '/workspace/agent-workbench';
    expect(isPathInside(cwd, '/workspace/agent-workbench/backups')).toBe(true);
    expect(isPathInside(cwd, '/tmp/agent-workbench-backups')).toBe(false);

    expect(() => resolveBackupConfig({
      SUPABASE_DB_URL: 'postgresql://example.invalid/postgres',
      SUPABASE_PROJECT_REF: 'project-ref',
      BACKUP_OUTPUT_DIR: '/workspace/agent-workbench/backups'
    } as NodeJS.ProcessEnv, cwd)).toThrow('BACKUP_OUTPUT_DIR must be outside the repository');
  });

  it('requires an absolute backup destination and all connection metadata', () => {
    expect(() => resolveBackupConfig({
      SUPABASE_DB_URL: 'postgresql://example.invalid/postgres',
      SUPABASE_PROJECT_REF: 'project-ref',
      BACKUP_OUTPUT_DIR: 'backups'
    } as NodeJS.ProcessEnv, '/workspace/agent-workbench')).toThrow('BACKUP_OUTPUT_DIR must be an absolute path');

    expect(() => resolveBackupConfig({
      SUPABASE_PROJECT_REF: 'project-ref',
      BACKUP_OUTPUT_DIR: '/tmp/backups'
    } as NodeJS.ProcessEnv, '/workspace/agent-workbench')).toThrow('SUPABASE_DB_URL is required');
  });

  it('builds the Supabase logical backup plan including migration history', () => {
    const databaseUrl = 'postgresql://example.invalid/postgres';
    const backupDir = '/tmp/agent-workbench-backup';
    const plan = createBackupPlan({ databaseUrl, backupDir });

    expect(plan.map((step) => step.name)).toEqual([
      'roles',
      'schema',
      'data',
      'migration_history_schema',
      'migration_history_data'
    ]);
    expect(plan.find((step) => step.name === 'data')?.args).toEqual(expect.arrayContaining([
      '--use-copy',
      '--data-only',
      '-x',
      'storage.buckets_vectors',
      'storage.vector_indexes'
    ]));
    expect(plan.find((step) => step.name === 'migration_history_data')?.args).toEqual(expect.arrayContaining([
      '--schema',
      'supabase_migrations'
    ]));
  });

  it('creates a manifest with file sizes and sha256 evidence', async () => {
    const backupDir = await mkdtemp(path.join(tmpdir(), 'agent-workbench-backup-test-'));
    cleanupPaths.push(backupDir);
    const files = [
      ['roles', 'roles.sql', 'roles'],
      ['schema', 'schema.sql', 'schema'],
      ['data', 'data.sql', 'data'],
      ['migration_history_schema', 'history_schema.sql', 'history schema'],
      ['migration_history_data', 'history_data.sql', 'history data']
    ] as const;

    const plan = [] as Array<{ name: string; file: string; args: string[] }>;
    for (const [name, fileName, contents] of files) {
      const file = path.join(backupDir, fileName);
      await writeFile(file, contents);
      plan.push({ name, file, args: [] });
    }

    const manifest = await createBackupManifest({
      projectRef: 'ofjgtlympedzgmaenizn',
      backupDir,
      createdAt: '2026-08-16T08:30:00.000Z',
      plan
    });

    expect(manifest).toMatchObject({
      format_version: 1,
      created_at: '2026-08-16T08:30:00.000Z',
      source: { project_ref: 'ofjgtlympedzgmaenizn' },
      backup_type: 'supabase_logical_dump',
      restore_notes: {
        includes_migration_history: true,
        storage_objects_backed_up: false
      }
    });
    expect(manifest.files).toHaveLength(5);
    expect(manifest.files.every((entry) => entry.sha256.length === 64)).toBe(true);
    expect(manifest.files.every((entry) => entry.bytes > 0)).toBe(true);
  });
});
