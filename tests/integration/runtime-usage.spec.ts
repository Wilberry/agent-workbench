import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const roots = [
  path.join(__dirname, '..', '..', 'apps', 'web', 'src'),
  path.join(__dirname, '..', '..', 'packages', 'agent-runtime', 'src')
];
const disallowedPattern = /\.from\(['"`]agent_versions['"`]\)/;

function scan(dir: string, found: string[]) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      if (file === 'node_modules' || file === '.git') continue;
      scan(fullPath, found);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (disallowedPattern.test(content)) {
        found.push(path.relative(process.cwd(), fullPath));
      }
    }
  }
}

describe('Runtime data access enforcement', () => {
  it('does not query agent_versions directly in runtime layer', () => {
    const found: string[] = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      scan(root, found);
    }
    expect(found).toEqual([]);
  });
});
