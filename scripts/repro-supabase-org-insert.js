import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('missing env');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  try {
    const payload = {
      name: `Temp Org ${Date.now()}`,
      slug: `temp-org-${Date.now()}`,
      description: 'Temp org for repro',
      owner_id: '00000000-0000-0000-0000-000000000000'
    };
    console.log('payload', payload);
    const res = await supabase.from('organizations').insert([payload]).select('*').single();
    console.log('res', res);
  } catch (err) {
    console.error('ERR', err);
  }
})();
