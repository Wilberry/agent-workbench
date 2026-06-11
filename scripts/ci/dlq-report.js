const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase.from('agent_run_jobs').select('id,run_id,status,attempts,error_message').eq('status', 'failed');
  if (error) {
    console.error('Failed to query agent_run_jobs:', error.message || error);
    process.exit(2);
  }

  const summary = {
    failed_count: Array.isArray(data) ? data.length : 0,
    failed_jobs: data || []
  };

  fs.writeFileSync('dlq-summary.json', JSON.stringify(summary, null, 2));
  console.log('DLQ summary written to dlq-summary.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
