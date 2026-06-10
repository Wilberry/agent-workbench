-- Demo seed data for Agent Workbench MVP.
-- If auth.admin.create_user is unavailable, create the demo user through Supabase Auth first.

with demo_user as (
  select (auth.admin.create_user(
    email := 'demo@agentworkbench.app',
    password := 'Demo1234!',
    email_confirm := true,
    user_metadata := '{"full_name":"Demo User","avatar_url":"https://images.unsplash.com/photo-1494790108377-be9c29b29330"}'
  )).id as id
)
insert into profiles (id, user_id, full_name, avatar_url)
select gen_random_uuid(), id, 'Demo User', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330' from demo_user;

insert into agents (id, user_id, name, description, system_prompt, model)
select gen_random_uuid(), id, 'Demo Assistant', 'A helpful assistant trained to answer questions using your content.',
  'You are Demo Assistant, an AI that helps users with thoughtful, concise answers.', 'gpt-4o-mini'
from demo_user;

with agent_row as (
  select id from agents where name = 'Demo Assistant' limit 1
), conversation_row as (
  insert into conversations (id, agent_id, user_id, title)
  select gen_random_uuid(), agent_row.id, demo_user.id, 'Demo chat session'
  from demo_user, agent_row
  returning id
)
insert into messages (conversation_id, role, content)
select conversation_row.id, 'user', 'Hello! Can you introduce yourself and tell me what you can do?'
from conversation_row;

insert into messages (conversation_id, role, content)
select conversation_row.id, 'assistant', 'Hello! I am Demo Assistant. I can help you explore your agent workflow, answer questions, and persist conversation history in Agent Workbench.'
from conversation_row;

-- Seed agent_runs table with a demo completed run
with demo_conversation as (
  select c.id, c.user_id from conversations c
  join agents a on a.id = c.agent_id
  where a.name = 'Demo Assistant' limit 1
)
insert into agent_runs (user_id, conversation_id, workflow, current_step, execution_trace, status)
select
  demo_conversation.user_id,
  demo_conversation.id,
  '["Planner", "Executor", "Reviewer"]'::jsonb,
  3,
  jsonb_build_array(
    jsonb_build_object(
      'stepIndex', 0,
      'agentRole', 'Planner',
      'input', 'What can you do?',
      'output', 'I can: 1) Answer questions, 2) Help with analysis, 3) Provide suggestions',
      'toolsCalled', '[]'::jsonb,
      'memoryUsed', false,
      'timestamp', NOW()::text,
      'modelIterations', 1
    ),
    jsonb_build_object(
      'stepIndex', 1,
      'agentRole', 'Executor',
      'input', 'What can you do?',
      'output', 'I execute by processing your request and providing thoughtful responses based on my capabilities.',
      'toolsCalled', '[]'::jsonb,
      'memoryUsed', false,
      'timestamp', NOW()::text,
      'modelIterations', 1
    ),
    jsonb_build_object(
      'stepIndex', 2,
      'agentRole', 'Reviewer',
      'input', 'What can you do?',
      'output', 'I can assist with questions, analysis, suggestions, and conversation continuity. Ready to help!',
      'toolsCalled', '[]'::jsonb,
      'memoryUsed', false,
      'timestamp', NOW()::text,
      'modelIterations', 1
    )
  ),
  'completed'
from demo_conversation;
