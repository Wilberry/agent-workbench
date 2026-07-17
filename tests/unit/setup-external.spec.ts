import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireExternalTestEnvironment } from '../setup.external';

const managedVariables = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'USE_MOCK_SUPABASE',
  'USE_MOCK_OPENAI',
  'OPENAI_API_KEY',
] as const;
const originalEnvironment = Object.fromEntries(
  managedVariables.map((name) => [name, process.env[name]]),
);

function validate(requireOpenAI = false) {
  requireExternalTestEnvironment({
    suiteName: 'Validator test',
    requiredSupabaseVariables: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    requireOpenAI,
  });
}

describe('external test environment validation', () => {
  beforeEach(() => {
    for (const name of managedVariables) delete process.env[name];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  afterEach(() => {
    for (const name of managedVariables) {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('does not require OpenAI when the suite does not exercise the provider', () => {
    expect(() => validate()).not.toThrow();
    expect(process.env.USE_MOCK_OPENAI).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('accepts an explicitly enabled OpenAI mock', () => {
    process.env.USE_MOCK_OPENAI = 'true';
    expect(() => validate(true)).not.toThrow();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('rejects a live-provider requirement without an OpenAI key', () => {
    expect(() => validate(true)).toThrow(
      'Validator test requires OPENAI_API_KEY unless USE_MOCK_OPENAI=true is explicitly set.',
    );
  });

  it('accepts a live-provider requirement with an OpenAI key', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    expect(() => validate(true)).not.toThrow();
  });

  it('rejects the Supabase mock for an external suite', () => {
    process.env.USE_MOCK_SUPABASE = 'true';
    expect(() => validate()).toThrow(
      'Validator test suite requires a real Supabase environment; USE_MOCK_SUPABASE=true is not supported.',
    );
  });
});
