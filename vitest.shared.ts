import path from 'node:path';
import type { UserConfig } from 'vitest/config';

export const sharedVitestConfig: UserConfig = {
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    hookTimeout: 20000,
    isolate: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@/*': path.resolve(__dirname, 'apps/web/src/*'),
      '@agent-workbench/sdk': path.resolve(__dirname, 'packages/sdk/src'),
      '@agent-workbench/sdk/*': path.resolve(__dirname, 'packages/sdk/src/*'),
      '@agent-workbench/agent-runtime': path.resolve(
        __dirname,
        'packages/agent-runtime/src',
      ),
      '@agent-workbench/agent-runtime/*': path.resolve(
        __dirname,
        'packages/agent-runtime/src/*',
      ),
    },
  },
};
