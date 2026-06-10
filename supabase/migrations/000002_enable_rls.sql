-- Enable Row Level Security and policies for user-scoped access

alter table profiles enable row level security;
alter table agents enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "Users can select their own profile" on profiles
  for select using (user_id = auth.uid());
create policy "Users can insert their own profile" on profiles
  for insert with check (user_id = auth.uid());
create policy "Users can update their own profile" on profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can delete their own profile" on profiles
  for delete using (user_id = auth.uid());

create policy "Users can select their own agents" on agents
  for select using (user_id = auth.uid());
create policy "Users can insert their own agents" on agents
  for insert with check (user_id = auth.uid());
create policy "Users can update their own agents" on agents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can delete their own agents" on agents
  for delete using (user_id = auth.uid());

create policy "Users can select their own conversations" on conversations
  for select using (user_id = auth.uid());
create policy "Users can insert their own conversations" on conversations
  for insert with check (user_id = auth.uid());
create policy "Users can update their own conversations" on conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can delete their own conversations" on conversations
  for delete using (user_id = auth.uid());

create policy "Users can select messages for their conversations" on messages
  for select using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );
create policy "Users can insert messages for their conversations" on messages
  for insert with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );
create policy "Users can update messages for their conversations" on messages
  for update using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );
create policy "Users can delete messages for their conversations" on messages
  for delete using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );
