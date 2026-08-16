#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function requiredEnvironment(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveBackupConfig(env = process.env, cwd = process.cwd()) {
  const databaseUrl = requiredEnvironment(env, 'SUPABASE_DB_URL');
  const projectRef = requiredEnvironment(env, 'SUPABASE_PROJECT_REF');
  const outputRoot = requiredEnvironment(env, 'BACKUP_OUTPUT_DIR');

  if (!path.isAbsolute(outputRoot)) {
    throw new Error('BACKUP_OUTPUT_DIR must be an absolute path');
  }
  if (isPathInside(cwd, outputRoot)) {
    throw new Error('BACKUP_OUTPUT_DIR must be outside the repository');
  }

  return {
    databaseUrl,
    projectRef,
    outputRoot: path.resolve(outputRoot),
    supabaseBin: env.SUPABASE_BIN?.trim() || 'supabase'
  };
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function createBackupPlan({ databaseUrl, backupDir }) {
  const file = (name) => path.join(backupDir, name);
  return [
    {
      name: 'roles',
      file: file('roles.sql'),
      args: ['db', 'dump', '--db-url', databaseUrl, '-f', file('roles.sql'), '--role-only']
    },
    {
      name: 'schema',
      file: file('schema.sql'),
      args: ['db', 'dump', '--db-url', databaseUrl, '-f', file('schema.sql')]
    },
    {
      name: 'data',
      file: file('data.sql'),
      args: [
        'db', 'dump', '--db-url', databaseUrl,
        '-f', file('data.sql'),
        '--use-copy', '--data-only',
        '-x', 'storage.buckets_vectors',
        '-x', 'storage.vector_indexes'
      ]
    },
    {
      name: 'migration_history_schema',
      file: file('history_schema.sql'),
      args: [
        'db', 'dump', '--db-url', databaseUrl,
        '-f', file('history_schema.sql'),
        '--schema', 'supabase_migrations'
      ]
    },
    {
      name: 'migration_history_data',
      file: file('history_data.sql'),
      args: [
        'db', 'dump', '--db-url', databaseUrl,
        '-f', file('history_data.sql'),
        '--use-copy', '--data-only',
        '--schema', 'supabase_migrations'
      ]
    }
  ];
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        signal
          ? `backup command terminated by ${signal}`
          : `backup command failed with exit code ${code ?? 'unknown'}`
      ));
    });
  });
}

async function fileEvidence(filePath) {
  const [contents, fileStat] = await Promise.all([
    readFile(filePath),
    stat(filePath)
  ]);
  return {
    file: path.basename(filePath),
    bytes: fileStat.size,
    sha256: createHash('sha256').update(contents).digest('hex')
  };
}

export async function createBackupManifest({ projectRef, backupDir, createdAt, plan }) {
  const files = [];
  for (const step of plan) {
    files.push({
      name: step.name,
      ...(await fileEvidence(step.file))
    });
  }
  return {
    format_version: 1,
    created_at: createdAt,
    source: {
      project_ref: projectRef
    },
    backup_type: 'supabase_logical_dump',
    files,
    restore_notes: {
      includes_migration_history: true,
      storage_objects_backed_up: false
    },
    backup_directory: backupDir
  };
}

export async function runDatabaseBackup({ env = process.env, cwd = process.cwd(), now = new Date() } = {}) {
  const config = resolveBackupConfig(env, cwd);
  const createdAt = now.toISOString();
  const backupDir = path.join(
    config.outputRoot,
    `agent-workbench-${config.projectRef}-${safeTimestamp(now)}`
  );

  await mkdir(backupDir, { recursive: false });
  const plan = createBackupPlan({
    databaseUrl: config.databaseUrl,
    backupDir
  });

  for (const step of plan) {
    process.stdout.write(`Creating ${step.name} backup...\n`);
    await runCommand(config.supabaseBin, step.args);
  }

  const manifest = await createBackupManifest({
    projectRef: config.projectRef,
    backupDir,
    createdAt,
    plan
  });
  const manifestPath = path.join(backupDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });

  process.stdout.write(`Database backup complete: ${backupDir}\n`);
  process.stdout.write(`Manifest: ${manifestPath}\n`);
  return { backupDir, manifestPath, manifest };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  runDatabaseBackup().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Database backup failed: ${message}\n`);
    process.exitCode = 1;
  });
}
