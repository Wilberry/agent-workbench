import { vi } from 'vitest';
import * as sdk from '@agent-workbench/sdk';

/**
 * Mock authentication for direct handler testing.
 * Patches createServerSupabaseClient to inject a test user into auth context.
 * 
 * Usage:
 *   beforeEach(() => mockAuthForTest(testUserId));
 *   afterEach(() => clearAuthMock());
 */
export function mockAuthForTest(userId: string) {
  // Get the real implementation (avoid circular mocking)
  const realCreateServerSupabaseClient = sdk.createServerSupabaseClient;
  
  // Create a mocked version that injects test user auth
  vi.spyOn(sdk, 'createServerSupabaseClient').mockImplementation(() => {
    const realClient = realCreateServerSupabaseClient();
    
    // Inject mocked auth.getUser() that returns our test user
    return {
      ...realClient,
      auth: {
        ...realClient.auth,
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: userId,
              email: `test-${userId}@example.com`,
              aud: 'authenticated',
              role: 'authenticated',
              app_metadata: {},
              user_metadata: { test: true }
            }
          },
          error: null
        })
      }
    } as any;
  });
}

/**
 * Clear authentication mocking
 */
export function clearAuthMock() {
  vi.restoreAllMocks();
}

