import './load-test-environment';
import { requireExternalTestEnvironment } from './setup.external';

requireExternalTestEnvironment({
  suiteName: 'Security',
  requiredSupabaseVariables: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
});
