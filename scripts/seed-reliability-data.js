require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RELIABILITY_TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const RELIABILITY_TEST_AGENT_ID = '00000000-0000-4000-8000-000000000002';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createOrGetUser(email) {
  const password = 'ReliabilityTest!23';

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ query: email });
  if (listError) {
    throw listError;
  }

  const users = listData?.users ?? [];
  const existingUser = users.find((user) => user.email === email);

  if (existingUser) {
    if (existingUser.id === RELIABILITY_TEST_USER_ID) {
      console.log(`Reusing existing auth user ${email} (${existingUser.id})`);
      return existingUser.id;
    }

    console.log(`Found auth user ${email} with mismatched ID ${existingUser.id}; deleting to recreate with fixed seeded ID.`);
    await supabase.auth.admin.deleteUser(existingUser.id);
  }

  console.log(`Creating auth user ${email}`);
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    id: RELIABILITY_TEST_USER_ID,
    email,
    password,
    email_confirm: true,
    user_metadata: { seed: 'reliability-test' }
  });

  if (createError) {
    throw createError;
  }

  const userId = createData?.user?.id ?? createData?.id;
  if (!userId) {
    throw new Error('Unexpected auth user response when creating test user');
  }

  return userId;
}

async function upsertProfile(userId) {
  const profile = {
    user_id: userId,
    full_name: 'Reliability Test User',
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2'
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'user_id' });

  if (error) throw error;
}

async function createOrGetOrganization(userId, slug) {
  const search = async () => {
    const { data: existingOrg, error: fetchError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId)
      .eq('name', 'Reliability Test Org')
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }
    return existingOrg;
  };

  const existingOrg = await search();
  if (existingOrg) {
    console.log(`Reusing existing organization ${existingOrg.id}`);
    return existingOrg.id;
  }

  const payload = {
    owner_id: userId,
    name: 'Reliability Test Org',
    description: 'Organization used for reliability tests',
    metadata: { test: true }
  };

  const insertOrg = async (insertPayload) => {
    const { data, error } = await supabase
      .from('organizations')
      .insert([insertPayload])
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  };

  try {
    payload.slug = slug;
    return await insertOrg(payload);
  } catch (err) {
    const message = err?.message ?? String(err);
    if (message.includes('column organizations.slug does not exist') || message.includes('column organizations.description does not exist') || message.includes('column organizations.metadata does not exist') || message.includes('Could not find the') || message.includes('unknown column') || message.includes('invalid column')) {
      delete payload.slug;
      delete payload.description;
      delete payload.metadata;
      return await insertOrg(payload);
    }
    throw err;
  }
}

async function ensureOrganizationMembership(orgId, userId) {
  try {
    const { data: existingMembership, error: fetchError } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existingMembership) {
      return;
    }

    const { error } = await supabase
      .from('organization_memberships')
      .insert([{ org_id: orgId, user_id: userId, role: 'owner' }]);

    if (error) throw error;
  } catch (err) {
    const message = err?.message ?? String(err);
    if (message.includes('relation "organization_memberships" does not exist') || message.includes('column organization_memberships')) {
      console.log('organization_memberships is not available in the current schema; skipping membership seeding.');
      return;
    }
    throw err;
  }
}

async function ensureOrgBilling(orgId) {
  try {
    const { data: existingBilling, error: fetchError } = await supabase
      .from('org_billing')
      .select('org_id')
      .eq('org_id', orgId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existingBilling) {
      return;
    }

    const { error } = await supabase
      .from('org_billing')
      .insert([{ org_id: orgId, plan: 'free', tokens_used: 0, runs_used: 0 }]);

    if (error) {
      const message = error?.message ?? String(error);
      if (message.includes('column org_billing.plan does not exist') || message.includes('relation "org_billing" does not exist') || message.includes('Could not find the')) {
        console.log('org_billing is not available in the current schema; skipping billing seeding.');
        return;
      }
      throw error;
    }
  } catch (err) {
    const message = err?.message ?? String(err);
    if (message.includes('relation "org_billing" does not exist') || message.includes('Could not find the') || message.includes('column org_billing')) {
      console.log('org_billing is not available in the current schema; skipping billing seeding.');
      return;
    }
    throw err;
  }
}

async function createOrGetAgent(userId, orgId) {
  const agentName = 'Reliability Test Agent';
  const { data: existingById, error: existingByIdError } = await supabase
    .from('agents')
    .select('id, user_id, name')
    .eq('id', RELIABILITY_TEST_AGENT_ID)
    .maybeSingle();

  if (existingByIdError) throw existingByIdError;
  if (existingById) {
    if (existingById.user_id === userId && existingById.name === agentName) {
      console.log(`Reusing existing seeded agent ${existingById.id}`);
      return existingById.id;
    }

    console.log(`Deleting mismatched seeded agent ${existingById.id} to recreate with fixed seeded ID.`);
    await supabase.from('agents').delete().eq('id', RELIABILITY_TEST_AGENT_ID);
  }

  const { data: existingAgent, error: fetchAgentError } = await supabase
    .from('agents')
    .select('id')
    .eq('name', agentName)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchAgentError) throw fetchAgentError;
  if (existingAgent) {
    console.log(`Reusing existing agent ${existingAgent.id}`);
    return existingAgent.id;
  }

  const payload = {
    id: RELIABILITY_TEST_AGENT_ID,
    user_id: userId,
    name: agentName,
    description: 'Agent used by reliability tests',
    system_prompt: 'You are a deterministic test agent used only by reliability tests.',
    model: 'gpt-4o-mini'
  };

  if (orgId) {
    payload.organization_id = orgId;
  }

  try {
    const { data, error } = await supabase
      .from('agents')
      .insert([payload])
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (err) {
    const message = err?.message ?? String(err);
    if (message.includes('column agents.organization_id does not exist') || message.includes('relation "agents" does not exist')) {
      delete payload.organization_id;
      const { data, error } = await supabase
        .from('agents')
        .insert([payload])
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    }
    throw err;
  }
}

async function createOrGetConversation(userId, agentId) {
  const conversationTitle = 'Reliability Test Conversation';
  const { data: existingConversation, error: fetchConvError } = await supabase
    .from('conversations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .eq('title', conversationTitle)
    .maybeSingle();

  if (fetchConvError) throw fetchConvError;
  if (existingConversation) {
    console.log(`Reusing existing conversation ${existingConversation.id}`);
    return existingConversation.id;
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert([
      {
        agent_id: agentId,
        user_id: userId,
        title: conversationTitle
      }
    ])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function maybeCreateProject(orgId, userId) {
  try {
    const projectName = 'Reliability Test Project';
    const { data: project, error } = await supabase
      .from('projects')
      .insert([
        {
          org_id: orgId,
          user_id: userId,
          name: projectName,
          description: 'Project placeholder for reliability testing'
        }
      ])
      .select('id')
      .single();

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.log('No projects table exists in the current schema; skipping project insertion.');
        return null;
      }
      throw error;
    }

    console.log(`Created project ${project.id}`);
    return project.id;
  } catch (err) {
    const message = err?.message ?? String(err);
    if (message.includes('relation "projects" does not exist') || message.includes('Could not find the table') || err?.code === 'PGRST205') {
      console.log('No projects table exists in the current schema; skipping project insertion.');
      return null;
    }
    throw err;
  }
}

(async () => {
  try {
    const email = 'reliability-test-user@example.com';
    const userId = await createOrGetUser(email);

    await upsertProfile(userId);

    const orgId = await createOrGetOrganization(userId, 'reliability-test-org');
    await ensureOrganizationMembership(orgId, userId);
    await ensureOrgBilling(orgId);

    const projectId = await maybeCreateProject(orgId, userId);
    if (projectId) {
      console.log(`Project seed completed: ${projectId}`);
    }

    const agentId = await createOrGetAgent(userId, orgId);
    const conversationId = await createOrGetConversation(userId, agentId);

    console.log('Seed complete');
    console.log({ userId, orgId, agentId, conversationId, projectId });
  } catch (error) {
    console.error('Seed script failed:', error);
    process.exit(1);
  }
})();
