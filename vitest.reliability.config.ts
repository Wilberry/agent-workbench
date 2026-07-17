import { defineConfig } from 'vitest/config';
import { sharedVitestConfig } from './vitest.shared';

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    include: ['tests/reliability/**/*.ts'],
    setupFiles: './tests/setup.reliability.ts',
  },
});
