import { describe, it, expect } from 'vitest';

export const RELIABILITY_TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
export const RELIABILITY_TEST_USER_EMAIL = 'reliability-suite-user@example.com';
export const RELIABILITY_TEST_AGENT_ID = '00000000-0000-4000-8000-000000000002';
export const RELIABILITY_TEST_AGENT_NAME = 'Reliability Suite Agent';

describe('Reliability seeded helper', () => {
  it('provides fixed seeded IDs for reliability tests', () => {
    expect(RELIABILITY_TEST_USER_ID).toBeDefined();
    expect(RELIABILITY_TEST_AGENT_ID).toBeDefined();
  });
});
