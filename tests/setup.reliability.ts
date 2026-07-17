import './load-test-environment';
import { requireExternalTestEnvironment } from './setup.external';

requireExternalTestEnvironment({
  suiteName: 'Reliability',
  requiredSupabaseVariables: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
});
