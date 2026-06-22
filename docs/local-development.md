# Local Development

This project supports both hosted Supabase instances and optional local Supabase development.
Docker is not required for current development if you use a hosted Supabase project and set the required environment variables.

## Docker readiness

- Docker Desktop is a prerequisite for local Supabase development on Windows and macOS.
- The repository does not include a `docker-compose.yml` file.
- Local Supabase is managed through the Supabase CLI (`supabase start`, `supabase db reset`) and the project metadata in `supabase/config.toml`.

## Prerequisites

Recommended tools:

- Node.js 22+
- pnpm 10+
- Git
- Supabase CLI (`npm install -g supabase` or `pnpm dlx supabase`) if you need local Supabase
- Docker Desktop only if you plan to run Supabase locally

## Environment variables

Copy `.env.example` to `.env.local` or `.env` and fill in the values.

Minimum values for hosted Supabase development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
BASE_URL=http://localhost:3000
```

### Notes

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used by the browser client.
- `SUPABASE_SERVICE_ROLE_KEY` is required by server-side SDK code and by integration tests.
- `OPENAI_API_KEY` is required for runtime tests and any local model integration that uses OpenAI.

## Hosted Supabase development (no Docker required)

If you already have a Supabase project, use that project and set the environment variables above.

1. Install dependencies:

```bash
pnpm install
```

2. Start the app:

```bash
pnpm dev
```

3. Run tests:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm test:reliability
pnpm test:playwright
```

## Local Supabase development (optional)

When using local Supabase, Docker Desktop must be installed and running.

1. Start Docker Desktop.
2. Start Supabase local stack from the repository root:

```bash
supabase start --no-telemetry
```

3. Reset the local database and apply all migrations from `supabase/migrations`:

```bash
supabase db reset --local --yes --workdir .
```

4. Optionally skip applying seed data:

```bash
supabase db reset --local --yes --workdir . --no-seed
```

5. Stop local Supabase when finished:

```bash
supabase stop
```

## Migration compatibility

All database migrations are stored in `supabase/migrations/*.sql`.

The local Supabase workflow is:

```bash
supabase db reset --local --yes --workdir .
```

This command resets the local database and applies all migrations in order.

If you are using a hosted Supabase instance instead of local development, ensure the hosted database is up-to-date by applying the same migration files through your preferred database migration process.

## Notes on repository configuration

- `supabase/config.toml` contains the local Supabase project configuration.
- `supabase/migrations` contains the SQL migration history.
- There is no repository-owned `docker-compose.yml`; Supabase local setup is handled via the Supabase CLI and Docker Desktop.

## Useful commands

- Install dependencies: `pnpm install`
- Start app: `pnpm dev`
- Run unit tests: `pnpm test:unit`
- Run integration tests: `pnpm test:integration`
- Run security tests: `pnpm test:security`
- Run reliability tests: `pnpm test:reliability`
- Run Playwright tests: `pnpm test:playwright`
- Reset local Supabase DB: `supabase db reset --local --yes --workdir .`
