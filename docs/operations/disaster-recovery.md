# Database Disaster Recovery Runbook

This runbook defines the v1.0 backup, restore, and database-aware rollback contract for Agent Workbench.

It is intentionally separate from normal deployment rollback. Reverting a web deployment and restoring a database are very different operations and should not share a panic button.

## Current production recovery posture

Audit date: 2026-08-16.

- Supabase project region: `eu-north-1`
- Postgres engine: 17
- Database size at audit: approximately 22.7 MB
- Storage buckets: 0
- Storage objects: 0
- Vault secrets: 0
- Relevant installed extensions include `vector`, `uuid-ossp`, `pgcrypto`, and `supabase_vault`
- Supabase organization plan: Free

The Free plan does not provide the managed automatic backup retention available on paid plans. Until the project is upgraded, Agent Workbench must maintain independent logical database backups.

Supabase references:

- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase CLI `db dump`](https://supabase.com/docs/reference/cli/v0/supabase-db-dump)

## Recovery objectives

The repository does not claim a proven RPO or RTO yet.

For the v1.0 release gate:

- take a fresh logical backup immediately before any production migration that can change data or compatibility;
- take a fresh logical backup immediately before the final v1.0 production cutover;
- while the project remains on the Free plan, maintain at least one current off-site backup whenever production data changes materially;
- complete one restore rehearsal into a disposable project and record the measured recovery time before claiming an RTO;
- record the timestamp of the most recent successful backup before claiming an RPO.

A backup file that has never been restored is evidence of export, not evidence of recoverability.

## Prerequisites

The backup command follows Supabase's documented logical migration procedure and requires:

- Node.js 22
- Supabase CLI
- Docker, because the Supabase CLI runs its Postgres dump tooling in a container
- a database connection string with the database password
- an absolute backup destination outside the repository

Never put database URLs, database passwords, service-role keys, or backup SQL files in the Git repository.

## Create a logical backup

Provide these values through a trusted operator shell or secret manager:

```text
SUPABASE_DB_URL
SUPABASE_PROJECT_REF
BACKUP_OUTPUT_DIR
```

`BACKUP_OUTPUT_DIR` must be an absolute path outside the Agent Workbench repository. The command rejects repo-local destinations to reduce the chance of committing production data.

Run:

```bash
pnpm ops:backup-db
```

The command creates a timestamped directory containing:

```text
roles.sql
schema.sql
data.sql
history_schema.sql
history_data.sql
manifest.json
```

The files have these purposes:

- `roles.sql` — custom database roles
- `schema.sql` — application schema
- `data.sql` — logical row data using `COPY`
- `history_schema.sql` and `history_data.sql` — `supabase_migrations` history so a restored project retains migration lineage
- `manifest.json` — source project ref, backup timestamp, file sizes, and SHA-256 hashes

The manifest never contains the database connection string.

After backup creation:

1. verify `manifest.json` exists;
2. verify every expected SQL file exists;
3. copy the complete timestamped directory to encrypted off-site storage;
4. retain the manifest with the backup set;
5. record the backup timestamp in release/incident evidence.

Do not treat the local working copy as the durable backup.

## Storage objects

Supabase database backups do not restore Storage API objects themselves. They only cover database state and storage metadata.

At the 2026-08-16 audit Agent Workbench has zero Storage buckets and zero Storage objects, so there is currently no separate object-backup payload. If product development starts using Supabase Storage, this runbook must be extended before those objects become production-critical.

## Restore rehearsal

Never rehearse by overwriting the production project.

Use a disposable Supabase project or other isolated PostgreSQL target. A Supabase project is preferred because Auth, extensions, Realtime, and platform roles need to behave like production.

### 1. Preserve evidence

Before any restore, retain:

- the backup directory;
- its `manifest.json`;
- the source Git commit and migration head;
- the target project ref;
- rehearsal start time.

### 2. Prepare the target

Create an isolated target and configure required extensions. At minimum verify the extensions used by production, especially `vector`.

Use the target database connection string as `NEW_DB_URL`.

### 3. Restore roles, schema, and data

Follow Supabase's supported `psql` restore sequence:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

If a roles file contains a platform-managed grant that the target cannot apply, follow the current Supabase restore troubleshooting guidance rather than broadly removing permission statements.

### 4. Restore migration history

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file history_schema.sql \
  --file history_data.sql \
  --dbname "$NEW_DB_URL"
```

### 5. Restore platform configuration

Verify and re-enable, where applicable:

- Realtime publications for tables used by the application;
- Auth settings and redirect URLs;
- non-default extensions;
- database webhooks;
- Edge Functions and their secrets;
- provider/application secrets in the deployment platform.

Database dumps are not a backup of Vercel, Render, Supabase dashboard configuration, or third-party provider credentials.

### 6. Verify the restored database

At minimum verify:

- migration history matches the source backup;
- core application tables exist;
- representative row counts are plausible;
- foreign keys and check constraints are present;
- RLS remains enabled where expected;
- `vector` is installed;
- queue tables and statuses are intact;
- the web readiness endpoint succeeds when a staging deployment is pointed at the restored target;
- authenticated staging smoke flows can read their own data without cross-tenant access.

Do not promote the restored target based only on successful SQL import.

### 7. Record recovery time

Record:

- restore start time;
- SQL restore completion time;
- application smoke completion time;
- total time to a verified usable system.

That measured value becomes the first defensible RTO evidence.

## Production rollback decision tree

### Web-only regression

If the database is healthy and the regression is entirely in the application deployment:

1. stop further promotion;
2. roll Vercel back to the last known-good deployment;
3. run `/api/health/live` and `/api/health/ready` smoke checks;
4. verify the previous application is compatible with the current database schema.

Do not restore the database for a web-only regression.

### Worker-only regression

If worker compute causes bad runtime behavior but persisted database state remains valid:

1. stop/disable the worker;
2. preserve queue rows and logs;
3. rely on lease/retry/checkpoint semantics rather than manually resetting jobs;
4. redeploy a known-good worker version before resuming claims.

Do not bulk-edit queue state as a rollback mechanism.

### Bad but backward-compatible migration

If a migration introduced an application issue but old and new application versions can safely use the new schema, prefer application rollback or a forward-fix migration.

Do not automatically run destructive down-migrations in production.

### Data corruption or incompatible migration

A database restore is the last-resort path when valid state cannot be recovered by a forward fix.

1. stop or sharply limit writes;
2. capture a backup of the damaged state for forensics when possible;
3. identify the newest known-good logical backup;
4. restore it into an isolated replacement project;
5. perform the full verification checklist;
6. rotate/reconfigure environment variables to the verified replacement only after approval;
7. redeploy and run smoke/E2E checks;
8. retain the original project until incident review and data-reconciliation decisions are complete.

Restoring an older snapshot can lose all writes after that snapshot. The incident owner must explicitly accept that recovery point before cutover.

## Vault and encryption note

The `supabase_vault` extension is installed, but the production audit found zero Vault secrets. If Vault secrets or column encryption are introduced later, revisit the Supabase encryption-root-key restore procedure before relying on this runbook for recovery.

## v1.0 closure evidence

This disaster-recovery slice is complete only when all of the following exist:

- repository-owned logical backup command;
- off-site backup location selected by the operator;
- at least one successful production logical backup;
- at least one successful isolated restore rehearsal;
- recorded migration parity and application smoke results;
- measured restore time;
- rollback owner and release evidence attached to the v1.0 candidate.

Until the backup and rehearsal are actually executed, the code and runbook are **ready**, but disaster recovery is not yet **proven**.
