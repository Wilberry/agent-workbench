const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '..', 'apps', 'web', 'src'),
  path.join(__dirname, '..', 'packages', 'agent-runtime', 'src')
];
const disallowedPattern = /\.from\(['"`]agent_versions['"`]\)/;
const matches = [];

function scan(dir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      if (file === 'node_modules' || file === '.git') continue;
      scan(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (disallowedPattern.test(content)) {
        matches.push(fullPath);
      }
    }
  }
}

for (const root of roots) {
  if (!fs.existsSync(root)) {
    continue;
  }
  scan(root);
}

if (matches.length > 0) {
  console.error('❌ Direct raw agent_versions usage found in runtime code:');
  for (const match of matches) {
    console.error(` - ${match}`);
  }
  process.exit(1);
}

console.log('✅ No raw agent_versions usage found in runtime code');
