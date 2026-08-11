import { describe, expect, it } from 'vitest';
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  hasApiKeyScope,
  parseBearerApiKey
} from '@agent-workbench/sdk';

describe('public API key primitives', () => {
  it('generates independent 256-bit secrets with the Agent Workbench prefix', () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first).toMatch(/^awb_live_[0-9a-f]{64}$/);
    expect(second).toMatch(/^awb_live_[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it('hashes API keys deterministically without retaining the raw secret', async () => {
    const key = `${API_KEY_PREFIX}${'ab'.repeat(32)}`;
    const first = await hashApiKey(key);
    const second = await hashApiKey(key);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toContain(key);
  });

  it('accepts only a strict Bearer header containing an Agent Workbench key', () => {
    const key = `${API_KEY_PREFIX}${'cd'.repeat(32)}`;

    expect(parseBearerApiKey(`Bearer ${key}`)).toBe(key);
    expect(parseBearerApiKey(`bearer ${key}`)).toBe(key);
    expect(parseBearerApiKey(`Basic ${key}`)).toBeNull();
    expect(parseBearerApiKey('Bearer not-an-agent-workbench-key')).toBeNull();
    expect(parseBearerApiKey(`Bearer ${key} trailing`)).toBeNull();
    expect(parseBearerApiKey(null)).toBeNull();
  });

  it('checks explicit public API scopes', () => {
    expect(hasApiKeyScope(['agents:read'], 'agents:read')).toBe(true);
    expect(hasApiKeyScope([], 'agents:read')).toBe(false);
  });
});
