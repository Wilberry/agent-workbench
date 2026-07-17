import './load-test-environment';
import { requireExternalTestEnvironment } from './setup.external';

requireExternalTestEnvironment({
  suiteName: 'Integration',
  requiredSupabaseVariables: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
});
