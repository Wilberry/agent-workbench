import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error The build helper is intentionally a plain Node ESM script.
import { prepareWorkerRuntime, rewriteModuleSpecifiers } from '../../scripts/ci/prepare-worker-runtime.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('worker runtime build preparation', () => {
  it('rewrites relative ESM imports to explicit JavaScript paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'awb-worker-build-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, 'dep.js'), 'export const value = 1;\n', 'utf8');

    const sourceFile = join(directory, 'index.js');
    const source = "import { value } from './dep';\nexport { value } from './dep';\nconst lazy = import('./dep');\n";

    expect(rewriteModuleSpecifiers(source, sourceFile)).toBe(
      "import { value } from './dep.js';\nexport { value } from './dep.js';\nconst lazy = import('./dep.js');\n"
    );
  });

  it('writes dist-local ESM metadata and resolves directory index imports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'awb-worker-dist-'));
    temporaryDirectories.push(directory);
    const nested = join(directory, 'nested');
    await mkdir(nested);
    await writeFile(join(nested, 'index.js'), 'export const nested = true;\n', 'utf8');
    await writeFile(join(directory, 'index.js'), "export { nested } from './nested';\n", 'utf8');

    const result = await prepareWorkerRuntime([directory]);

    expect(result).toEqual({ rewrittenFiles: 1, roots: 1 });
    expect(await readFile(join(directory, 'package.json'), 'utf8')).toBe('{\n  "type": "module"\n}\n');
    expect(await readFile(join(directory, 'index.js'), 'utf8')).toBe(
      "export { nested } from './nested/index.js';\n"
    );
  });
});
