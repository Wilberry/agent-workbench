import { createServerSupabaseClient } from '@agent-workbench/sdk';

export type OperationalCheckStatus = 'ok' | 'failed' | 'skipped';

export type OperationalReadiness = {
  status: 'ready' | 'not_ready';
  checks: {
    configuration: OperationalCheckStatus;
    database: OperationalCheckStatus;
  };
};

export type ReadinessOptions = {
  env?: NodeJS.ProcessEnv;
  checkDatabase?: () => Promise<void>;
};

const REQUIRED_SERVER_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
] as const;

export function hasRequiredServerEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return REQUIRED_SERVER_ENVIRONMENT.every((name) => {
    const value = env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export async function checkSupabaseReadiness(): Promise<void> {
  const supabase = createServerSupabaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);

    if (error) {
      throw new Error('Supabase readiness probe failed');
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOperationalReadiness(
  options: ReadinessOptions = {}
): Promise<OperationalReadiness> {
  const env = options.env ?? process.env;
  const checkDatabase = options.checkDatabase ?? checkSupabaseReadiness;

  if (!hasRequiredServerEnvironment(env)) {
    return {
      status: 'not_ready',
      checks: {
        configuration: 'failed',
        database: 'skipped'
      }
    };
  }

  try {
    await checkDatabase();
    return {
      status: 'ready',
      checks: {
        configuration: 'ok',
        database: 'ok'
      }
    };
  } catch {
    return {
      status: 'not_ready',
      checks: {
        configuration: 'ok',
        database: 'failed'
      }
    };
  }
}
