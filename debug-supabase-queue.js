require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

console.log('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'unset');
console.log('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'unset');
console.log('OPENAI_API_KEY', process.env.OPENAI_API_KEY ? 'set' : 'unset');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const conversationId = randomUUID();
  const userId = randomUUID();
  const agentId = randomUUID();

  console.log('Inserting debug conversation...');
  const { data: conversation, error: convErr } = await supabase.from('conversations').insert([
    { id: conversationId, agent_id: agentId, user_id: userId, title: 'debug queue test' }
  ]).select('id').single();
  console.log('conversation error', convErr);
  console.log('conversation', conversation);

  console.log('Inserting debug job...');
  const { data: job, error: jobErr } = await supabase.from('agent_run_jobs').insert([
    {
      run_id: randomUUID(),
      user_id: userId,
      conversation_id: conversationId,
      message: 'debug queue test',
      workflow: ['Planner'],
      memories: [],
      status: 'pending'
    }
  ]).select('id,run_id,status').single();
  console.log('job insert error', jobErr);
  console.log('job', job);

  console.log('Querying all pending jobs...');
  const { data: pending, error: pendingErr } = await supabase.from('agent_run_jobs').select('*').eq('status', 'pending');
  console.log('pending err', pendingErr);
  console.log('pending count', Array.isArray(pending) ? pending.length : 0);

  console.log('Calling dequeue_agent_run_job RPC...');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('dequeue_agent_run_job');
  console.log('rpc error', rpcErr);
  console.log('rpc data', rpcData);

  if (rpcData) {
    console.log('rpcData type', typeof rpcData, Array.isArray(rpcData));
  }

  console.log('Querying job status after RPC...');
  const { data: allJobs, error: allErr } = await supabase.from('agent_run_jobs').select('*').eq('conversation_id', conversationId);
  console.log('all jobs', allErr, allJobs);
})();
