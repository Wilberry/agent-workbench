import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.ts'],
    setupFiles: './tests/setup.ts',
    threads: false,
    hookTimeout: 20000,
    isolate: true
  },
  resolve: {
    alias: {
      '@agent-workbench/sdk': path.resolve(__dirname, 'packages/sdk/src'),
      '@agent-workbench/sdk/*': path.resolve(__dirname, 'packages/sdk/src/*'),
      '@agent-workbench/agent-runtime': path.resolve(__dirname, 'packages/agent-runtime/src'),
      '@agent-workbench/agent-runtime/*': path.resolve(__dirname, 'packages/agent-runtime/src/*')
    }
  }
});
