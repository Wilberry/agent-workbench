import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const distRoots = [
  join(repositoryRoot, 'packages/sdk/dist'),
  join(repositoryRoot, 'packages/agent-runtime/dist')
];

function normalizeRelativeSpecifier(sourceFile, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
  if (extname(specifier)) return specifier;

  const target = resolve(dirname(sourceFile), specifier);
  if (existsSync(`${target}.js`)) return `${specifier}.js`;
  if (existsSync(join(target, 'index.js'))) return `${specifier.replace(/\/$/, '')}/index.js`;

  return specifier;
}

export function rewriteModuleSpecifiers(source, sourceFile) {
  const rewrite = (_match, prefix, specifier, suffix) =>
    `${prefix}${normalizeRelativeSpecifier(sourceFile, specifier)}${suffix}`;

  return source
    .replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"]+)(['"])/g, rewrite)
    .replace(/(\bimport\s*['"])(\.{1,2}\/[^'"]+)(['"])/g, rewrite)
    .replace(/(\bimport\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g, rewrite);
}

async function walkJavaScriptFiles(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }

  return files;
}

export async function prepareWorkerRuntime(roots = distRoots) {
  let rewrittenFiles = 0;

  for (const root of roots) {
    if (!existsSync(root)) {
      throw new Error(`Worker runtime build output not found: ${root}`);
    }

    await writeFile(join(root, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');

    for (const file of await walkJavaScriptFiles(root)) {
      const source = await readFile(file, 'utf8');
      const rewritten = rewriteModuleSpecifiers(source, file);
      if (rewritten !== source) {
        await writeFile(file, rewritten, 'utf8');
        rewrittenFiles += 1;
      }
    }
  }

  return { rewrittenFiles, roots: roots.length };
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  prepareWorkerRuntime()
    .then((result) => {
      console.log(`Prepared worker runtime: ${result.rewrittenFiles} file(s) rewritten across ${result.roots} dist root(s)`);
    })
    .catch((error) => {
      console.error(`Failed to prepare worker runtime: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
