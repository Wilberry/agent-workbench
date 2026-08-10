import { describe, expect, it, vi } from 'vitest';
import { agents } from '@agent-workbench/sdk';

function createInsertClient() {
  const single = vi.fn(async () => ({
    data: {
      id: 'agent-1',
      user_id: 'user-1',
      organization_id: null,
      name: 'test',
      description: null,
      system_prompt: 'help',
      model: 'gpt-4o-mini',
      provider: 'openai',
      created_at: new Date().toISOString()
    },
    error: null
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return { client: { from } as any, from, insert };
}

describe('agent provider/model selection contract', () => {
  it('keeps the legacy OpenAI model default when provider is omitted', async () => {
    const { client, insert } = createInsertClient();

    await agents.create(
      'user-1',
      { name: 'test', system_prompt: 'help' },
      null,
      client
    );

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4o-mini'
      })
    ]);
  });

  it('requires an explicit model for a non-default provider', async () => {
    const from = vi.fn();

    await expect(
      agents.create(
        'user-1',
        { name: 'test', system_prompt: 'help', provider: 'anthropic' },
        null,
        { from } as any
      )
    ).rejects.toThrow('model is required when creating an agent with provider: anthropic');

    expect(from).not.toHaveBeenCalled();
  });

  it('requires provider and model to change together', async () => {
    const from = vi.fn();

    await expect(
      agents.update(
        'agent-1',
        { provider: 'anthropic' },
        { from } as any
      )
    ).rejects.toThrow('model must be provided when provider is updated');

    expect(from).not.toHaveBeenCalled();
  });
});
