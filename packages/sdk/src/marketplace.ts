import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Minimal stub for tests — real implementation removed during debugging.
// This file intentionally provides minimal exports so security tests can import the SDK.
export const marketplace = {
  async listPublicAgentVersions(_limit = 50, _client?: SupabaseClient<Database>) {
    return [] as any[];
  },
  async getAgentVersion(_versionId: string, _client?: SupabaseClient<Database>) {
    return null as any;
  },
  async installAgent(..._args: any[]) {
    throw new Error('marketplace.installAgent stub called in tests');
  },
  async forkMarketplaceAgent(..._args: any[]) {
    throw new Error('marketplace.forkMarketplaceAgent stub called in tests');
  },
  async listOrgInstalledAgents(_orgId: string, _client?: SupabaseClient<Database>) {
    return [] as any[];
  }
};

export default marketplace;
