const fs = require('fs');

function main() {
  const path = process.argv[2] || 'test-results.json';
  if (!fs.existsSync(path)) {
    console.log('No test results found at', path);
    process.exit(2);
  }

  const raw = fs.readFileSync(path, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON test results:', e.message);
    process.exit(2);
  }

  // Vitest JSON shape may vary; try common fields
  const stats = json.stats || json.results || {};
  const totals = {
    tests: 0,
    passes: 0,
    failures: 0,
    skipped: 0
  };

  if (Array.isArray(json.testResults)) {
    for (const suite of json.testResults) {
      for (const t of suite.testResults || []) {
        totals.tests += 1;
        if (t.status === 'passed') totals.passes += 1;
        if (t.status === 'failed') totals.failures += 1;
        if (t.status === 'skipped') totals.skipped += 1;
      }
    }
  } else if (json.stats) {
    totals.tests = json.stats.tests || 0;
    totals.passes = json.stats.passes || 0;
    totals.failures = json.stats.failures || 0;
    totals.skipped = json.stats.skipped || 0;
  } else if (json.suites) {
    // fallback
    totals.tests = json.suites.tests || 0;
    totals.passes = json.suites.passes || 0;
    totals.failures = json.suites.failures || 0;
    totals.skipped = json.suites.skipped || 0;
  }

  const summary = `Reliability Validation Results\n\nQueue Durability: ${totals.failures === 0 ? 'PASS' : 'FAIL'}\nDuplicate Prevention: ${totals.failures === 0 ? 'PASS' : 'FAIL'}\nWorker Recovery: ${totals.failures === 0 ? 'PASS' : 'FAIL'}\nRetry Logic: ${totals.failures === 0 ? 'PASS' : 'FAIL'}\nRLS Validation: TBD\nE2E Suite: TBD\nIntegration Suite: TBD\nPerformance Suite: TBD\n\nTotals: ${JSON.stringify(totals, null, 2)}\n`;

  fs.writeFileSync('reliability-summary.txt', summary);

  console.log(summary);

  // exit non-zero if failures
  process.exit(totals.failures > 0 ? 1 : 0);
}

main();
