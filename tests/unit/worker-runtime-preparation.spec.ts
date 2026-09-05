import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rewriteModuleSpecifiers } from '../../scripts/ci/prepare-worker-runtime.mjs';

describe('worker runtime preparation', () => {
  const sdkEvaluationDist = resolve(process.cwd(), 'packages/sdk/dist/evaluations.js');

  it('rewrites the SDK runtime workspace import to the copied runtime artifact', () => {
    const source = `const runtimeModule = await eval('import("@agent-workbench/agent-runtime")');`;

    expect(rewriteModuleSpecifiers(source, sdkEvaluationDist)).toBe(
      `const runtimeModule = await eval('import("../../agent-runtime/dist/index.js")');`
    );
  });

  it('leaves unrelated bare package imports unchanged', () => {
    const source = `import { createClient } from '@supabase/supabase-js';`;

    expect(rewriteModuleSpecifiers(source, sdkEvaluationDist)).toBe(source);
  });
});
